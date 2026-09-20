(() => {
  'use strict';

  const LOCAL_STATE_KEY = 'calcDaily.v2';

  /* =========================================================
     云同步的失败模型（Task 5J）
     =========================================================

     旧的同步只有一个 syncTail 串行链：每次操作 `await` 云 SDK 的返回值，
     没有超时、没有重试、也没有在失败后把状态放回队列。三件事都会真的出事：

       1. 一次请求卡住（弱网、被中间设备吞掉、SDK 内部重试），syncTail 就
          永远不释放 —— 此后所有同步都排在它后面，表现是「学习记录再也没
          同步上去」，而界面上什么都看不到；
       2. 一次瞬时抖动（DNS、502）就丢掉这一轮，要等用户下次操作才再试；
       3. 断网期间的操作没人管，恢复联网后也不会自动补上。

     这一版给每次云操作加上「超时 + 瞬时错误重试 + 退避」，并且无论成败都在
     finally 里释放队列；失败的状态会**放回队列**并按退避重试，
     联网恢复时立即冲刷。
     ========================================================= */

  const SYNC_TIMEOUT_MS = 12000;
  const SYNC_ATTEMPTS = 2;
  const SYNC_BACKOFF_MS = 700;
  const RETRY_MIN_MS = 5000;
  const RETRY_MAX_MS = 60000;

  let currentUser = null;
  let syncTimer = null;
  let syncTail = Promise.resolve();
  let userGeneration = 0;
  let resetting = false;
  let syncReady = false;
  let pendingState = null;
  let lastSyncAt = null;
  let lastError = null;
  let lastQueuedState = null;
  let retryTimer = null;
  let retryDelayMs = RETRY_MIN_MS;

  const syncStats = {
    attempts: 0,
    retries: 0,
    timeouts: 0,
    failures: 0,
    recoveries: 0,
    lastFailureAt: null,
    lastFailureReason: null,
    lastFailureKind: null
  };

  const syncedAttemptIds = new Set();

  function client() {
    return window.CalcDailyCloudBase?.client || null;
  }

  function configured() {
    return Boolean(
      window.CalcDailyCloudBase?.configured &&
      client()
    );
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function emitStatus(status, message = '') {
    window.dispatchEvent(
      new CustomEvent('calcdaily:sync-status', {
        detail: {
          status,
          message,
          lastSyncAt,
          lastError
        }
      })
    );
  }

  /* ── 超时 / 重试 / 退避 ──────────────────────────────────── */

  function sleepMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isOnline() {
    const flag = window.navigator?.onLine;
    return flag === undefined ? true : Boolean(flag);
  }

  /* 超时不是「同步失败」的一种口味，而是「这次结果不可知」：
     请求可能其实成功了。三个 upsert 都是幂等的，所以重试是安全的；
     但绝不能因为一次超时就把这次学习记录丢掉。 */
  function withTimeout(promise, label, ms = SYNC_TIMEOUT_MS) {
    let timer = null;

    const guard = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`${label} 超时（${ms}ms 未返回）`);
        error.code = 'SYNC_TIMEOUT';
        reject(error);
      }, ms);
    });

    return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
  }

  /* 只有「再试一次可能成功」的错误才重试。SDK 把错误都压成 message，
     所以按关键词判断；同时把超时与当前断网状态视为可重试 ——
     这两种情况占线上同步失败的大多数。 */
  function isTransient(error) {
    if (!error) return false;
    if (error.code === 'SYNC_TIMEOUT') return true;
    if (!isOnline()) return true;

    return /timeout|timed out|超时|network|fetch|networkerror|econn|socket|epipe|502|503|504|429|rate limit|too many|temporar/i
      .test(String(error.message || error));
  }

  function failureKind(error) {
    if (error?.code === 'SYNC_TIMEOUT') return 'sync_timeout';
    return isOnline() ? 'sync_error' : 'sync_offline';
  }

  async function withRetry(task, label) {
    let lastError = null;

    for (let attempt = 1; attempt <= SYNC_ATTEMPTS; attempt++) {
      syncStats.attempts++;

      try {
        return await withTimeout(task(), label);

      } catch (error) {
        lastError = error;

        if (attempt >= SYNC_ATTEMPTS || !isTransient(error)) break;

        syncStats.retries++;
        await sleepMs(SYNC_BACKOFF_MS * attempt);
      }
    }

    throw lastError;
  }

  /* 失败之后按退避重排。退避是指数的，但**不无限增长**也不无休止重试：
     到上限（60s）就按 60s 一次慢慢试，直到联网事件或下一次操作把它冲刷掉。 */
  function scheduleRetry() {
    if (!configured() || !currentUser || resetting) return;
    if (retryTimer) return;

    retryTimer = setTimeout(() => {
      retryTimer = null;
      retryDelayMs = Math.min(retryDelayMs * 2, RETRY_MAX_MS);
      flushPending();
    }, retryDelayMs);
  }

  function clearRetry() {
    clearTimeout(retryTimer);
    retryTimer = null;
    retryDelayMs = RETRY_MIN_MS;
  }

  function setUser(user) {
    if ((currentUser?.id || null) !== (user?.id || null)) {
      userGeneration++;
      clearTimeout(syncTimer);
      clearRetry();
      lastQueuedState = null;
      pendingState = null;
      syncedAttemptIds.clear();
      syncReady = false;
    }
    currentUser = user || null;
  }

  function assertUser(userId, generation) {
    if (generation !== userGeneration || currentUser?.id !== userId) {
      throw new Error('账号状态已改变，本次同步已取消。');
    }
  }

  function getUser() {
    return currentUser;
  }

  function sanitizeState(state) {
    const next = clone(state || {});

    // 正在进行中的某一组题仍属于本机 Session。
    next.activeSession = null;

    return next;
  }

  function meaningfulState(state) {
    if (!state || typeof state !== 'object') return false;

    return Boolean(
      Number(state.stats?.attempts || 0) > 0 ||
      Array.isArray(state.history) && state.history.length ||
      Array.isArray(state.reviews) && state.reviews.length ||
      Array.isArray(state.checkins) && state.checkins.length ||
      state.profile?.diagnosed ||
      (
        state.profile?.placementSource &&
        state.profile.placementSource !== 'default'
      )
    );
  }

  function stateTimestamp(state, fallback = 0) {
    const candidates = [
      state?._meta?.localUpdatedAt,
      state?.profile?.diagnosisCompletedAt,
      state?.history?.length
        ? state.history[state.history.length - 1]?.at
        : null,
      state?.reviews?.length
        ? [...state.reviews]
            .map(item => item.updatedAt)
            .filter(Boolean)
            .sort()
            .at(-1)
        : null
    ]
      .map(value => value ? new Date(value).getTime() : NaN)
      .filter(Number.isFinite);

    return candidates.length
      ? Math.max(...candidates)
      : fallback;
  }

  function mergeHistory(localHistory = [], cloudHistory = []) {
    const map = new Map();

    for (const item of [...cloudHistory, ...localHistory]) {
      if (!item?.id) continue;

      const old = map.get(item.id);

      if (!old) {
        map.set(item.id, clone(item));
        continue;
      }

      const oldTime = new Date(old.at || 0).getTime();
      const newTime = new Date(item.at || 0).getTime();

      if (newTime >= oldTime) {
        map.set(item.id, clone(item));
      }
    }

    return [...map.values()]
      .sort((a, b) =>
        new Date(a.at || 0).getTime() -
        new Date(b.at || 0).getTime()
      )
      .slice(-1200);
  }

  function mergeReviews(localReviews = [], cloudReviews = []) {
    const map = new Map();

    for (const item of [...cloudReviews, ...localReviews]) {
      const id = item?.id || item?.key;
      if (!id) continue;

      const old = map.get(id);

      if (!old) {
        map.set(id, clone(item));
        continue;
      }

      const oldTime = new Date(old.updatedAt || 0).getTime();
      const newTime = new Date(item.updatedAt || 0).getTime();

      if (newTime >= oldTime) {
        map.set(id, clone(item));
      }
    }

    return [...map.values()];
  }

  function mergeSnapshots(localState, cloudState, cloudUpdatedAt) {
    if (!meaningfulState(cloudState)) {
      return clone(localState);
    }

    if (!meaningfulState(localState)) {
      const cloudOnly = clone(cloudState);
      cloudOnly.activeSession = localState?.activeSession || null;
      return cloudOnly;
    }

    const localTime = stateTimestamp(localState, 0);
    const cloudTime = Math.max(
      stateTimestamp(cloudState, 0),
      cloudUpdatedAt
        ? new Date(cloudUpdatedAt).getTime()
        : 0
    );

    // 学习模型、设置、统计等状态以更新较晚的一端为主。
    const dominant = localTime > cloudTime
      ? clone(localState)
      : clone(cloudState);

    dominant.history = mergeHistory(
      localState.history || [],
      cloudState.history || []
    );

    dominant.reviews = mergeReviews(
      localState.reviews || [],
      cloudState.reviews || []
    );

    dominant.checkins = [
      ...new Set([
        ...(cloudState.checkins || []),
        ...(localState.checkins || [])
      ])
    ].sort();

    // 当前做题 Session 只留当前设备上的本地版本。
    dominant.activeSession = localState.activeSession || null;

    dominant._meta = {
      ...(dominant._meta || {}),
      localUpdatedAt: new Date(
        Math.max(localTime, cloudTime, Date.now())
      ).toISOString()
    };

    return dominant;
  }

  function questionJsonFromHistory(item) {
    return {
      question_id: item.question_id || item.questionId || item.id,
      model: item.model || null,
      generator_prompt_version: item.generator_prompt_version || null,
      review_prompt_version: item.review_prompt_version || null,
      verification: item.verification || null,
      instruction: item.instruction || '',
      expression: item.expression || '',
      prompt: item.prompt || '',
      answer: item.answer || '',
      solution: item.solution || '',
      difficultyConfidence:
        item.difficultyConfidence ?? null,
      difficultyDimensions:
        item.difficultyDimensions || null
    };
  }

  function questionJsonFromReview(item) {
    return {
      question_id: item.question_id || item.questionId || item.id,
      model: item.model || null,
      generator_prompt_version: item.generator_prompt_version || null,
      review_prompt_version: item.review_prompt_version || null,
      verification: item.verification || null,
      instruction: item.instruction || '',
      expression: item.expression || '',
      prompt: item.prompt || '',
      answer: item.answer || '',
      solution: item.solution || ''
    };
  }

  async function throwIfError(result, label) {
    if (result?.error) {
      const error = new Error(
        `${label}: ${result.error.message || 'unknown error'}`
      );

      error.cause = result.error;
      throw error;
    }

    return result?.data;
  }

  async function loadCloudSnapshot(userId) {
    if (!configured() || !userId) return null;

    const result = await withTimeout(
      client()
        .from('user_state')
        .select('state_json, updated_at')
        .eq('user_id', userId)
        .maybeSingle(),
      '读取云端学习状态'
    );

    if (result.error) {
      throw new Error(
        `读取云端学习状态失败：${result.error.message}`
      );
    }

    return result.data || null;
  }

  async function upsertProfile(user, now) {
    const displayName =
      user.user_metadata?.display_name ||
      String(user.email || '').split('@')[0] ||
      'CalcDaily User';

    await throwIfError(
      await client()
        .from('profiles')
        .upsert(
          {
            user_id: user.id,
            display_name: displayName,
            last_active_at: now
          },
          { onConflict: 'user_id' }
        ),
      'profiles'
    );
  }

  async function upsertCoreState(state, now, userId) {
    const snapshot = sanitizeState(state);

    await throwIfError(
      await client()
        .from('user_state')
        .upsert(
          {
            user_id: userId,
            state_json: snapshot,
            updated_at: now
          },
          { onConflict: 'user_id' }
        ),
      'user_state'
    );

    await throwIfError(
      await client()
        .from('user_settings')
        .upsert(
          {
            user_id: userId,
            difficulty_mode:
              snapshot.settings?.difficultyMode || 'adaptive',
            training_mode:
              snapshot.settings?.trainingMode || 'balanced',
            daily_count:
              Number(snapshot.settings?.dailyCount) || 10,
            manual_levels:
              snapshot.settings?.manualLevels || {},
            updated_at: now
          },
          { onConflict: 'user_id' }
        ),
      'user_settings'
    );

    const modules = ['limit', 'derivative', 'integral'];

    const moduleRows = modules.map(module => ({
      user_id: userId,
      module,
      ability:
        Number(
          snapshot.profile?.abilityByModule?.[module]
        ) || 6,
      display_level:
        Number(
          snapshot.profile?.displayLevelByModule?.[module]
        ) || 6,
      confidence:
        Number(
          snapshot.profile?.confidenceByModule?.[module]
        ) || 0.15,
      effective_attempts:
        Number(
          snapshot.profile?.effectiveAttemptsByModule?.[module]
        ) || 0,
      updated_at: now
    }));

    await throwIfError(
      await client()
        .from('module_progress')
        .upsert(
          moduleRows,
          { onConflict: 'user_id,module' }
        ),
      'module_progress'
    );

    const topicRows = Object.values(
      snapshot.stats?.byTopic || {}
    )
      .filter(item =>
        item?.module &&
        item?.topic
      )
      .map(item => ({
        user_id: userId,
        module: item.module,
        topic: item.topic,
        ability:
          Number(item.ability) || 6,
        attempts:
          Number(item.attempts) || 0,
        correct:
          Number(item.correct) || 0,
        confidence:
          Number(item.confidence) || 0.15,
        updated_at: now
      }));

    if (topicRows.length) {
      await throwIfError(
        await client()
          .from('topic_progress')
          .upsert(
            topicRows,
            { onConflict: 'user_id,module,topic' }
          ),
        'topic_progress'
      );
    }

    const reviewRows = (snapshot.reviews || [])
      .filter(item => item?.id)
      .map(item => ({
        user_id: userId,
        id: item.id,
        review_key: item.key || null,
        module: item.module,
        topic: item.topic || '综合基础',
        question_json: questionJsonFromReview(item),
        wrong_count:
          Number(item.wrongCount) || 0,
        correct_streak:
          Number(item.correctStreak) || 0,
        high_freq:
          item.highFreq !== false,
        next_review_at:
          item.nextReviewAt || null,
        updated_at:
          item.updatedAt || now,
        provisional_difficulty:
          item.provisionalDifficulty ?? null,
        calibrated_difficulty:
          item.calibratedDifficulty ?? null,
        difficulty_model_version:
          item.difficultyModelVersion || null
      }));

    if (reviewRows.length) {
      await throwIfError(
        await client()
          .from('review_queue')
          .upsert(
            reviewRows,
            { onConflict: 'user_id,id' }
          ),
        'review_queue'
      );
    }

    const checkinRows = (snapshot.checkins || [])
      .filter(Boolean)
      .map(date => ({
        user_id: userId,
        checkin_date: date
      }));

    if (checkinRows.length) {
      await throwIfError(
        await client()
          .from('checkins')
          .upsert(
            checkinRows,
            { onConflict: 'user_id,checkin_date' }
          ),
        'checkins'
      );
    }
  }

  async function upsertAttempts(state, full = false, userId, generation) {
    const history = Array.isArray(state?.history)
      ? state.history
      : [];

    const pending = full
      ? history
      : history.filter(
          item => item?.id && !syncedAttemptIds.has(item.id)
        );

    const rows = pending
      .filter(item => item?.id)
      .map(item => ({
        user_id: userId,
        id: item.id,
        question_id: item.questionId || null,
        module: item.module || null,
        topic: item.topic || null,
        purpose: item.purpose || null,
        question_json: questionJsonFromHistory(item),
        user_answer:
          item.userAnswer ?? null,
        correct:
          typeof item.correct === 'boolean'
            ? item.correct
            : null,
        needs_manual_check:
          Boolean(item.needsManualCheck),
        counts_toward_stats:
          item.countsTowardStats !== false,
        error_type:
          item.errorType || null,
        requested_difficulty:
          item.requestedDifficulty ?? null,
        provisional_difficulty:
          item.provisionalDifficulty ?? null,
        calibrated_difficulty:
          item.calibratedDifficulty ?? null,
        difficulty_model_version:
          item.difficultyModelVersion || null,
        difficulty_confidence:
          item.difficultyConfidence ?? null,
        difficulty_dimensions:
          item.difficultyDimensions || null,
        ability_before:
          item.abilityBefore ?? null,
        ability_after:
          item.abilityAfter ?? null,
        predicted_correct_probability:
          item.predictedCorrectProbability ?? null,
        learning_rate:
          item.learningRate ?? null,
        ability_weight:
          item.abilityWeight ?? null,
        topic_ability_before:
          item.topicAbilityBefore ?? null,
        topic_ability_after:
          item.topicAbilityAfter ?? null,
        created_at:
          item.at || isoNow()
      }));

    const chunkSize = 100;

    for (let i = 0; i < rows.length; i += chunkSize) {
      assertUser(userId, generation);
      const chunk = rows.slice(i, i + chunkSize);

      await throwIfError(
        await client()
          .from('attempts')
          .upsert(
            chunk,
            { onConflict: 'user_id,id' }
          ),
        'attempts'
      );

      assertUser(userId, generation);
      chunk.forEach(item => syncedAttemptIds.add(item.id));
    }
  }

  function syncNow(state, options = {}) {
    if (!configured() || !currentUser || !state || resetting) return Promise.resolve(false);
    if (!syncReady && !options.bootstrap) {
      return resolveAfterSignIn(state).then(() => true);
    }
    const user = clone(currentUser);
    const generation = userGeneration;
    const snapshot = clone(state);
    const operation = syncTail.then(async () => {
      assertUser(user.id, generation);
      lastError = null;
      emitStatus('syncing', '正在同步学习记录…');

      /* 三个 upsert 都是幂等的（onConflict 指定了主键），所以这里整体重试
         是安全的：超时之后我们并不知道服务端到底写没写成功，
         幂等重试是唯一能把这件事做对的方式。 */
      const push = task => withRetry(task, '同步学习记录');

      let succeeded = false;
      let transient = false;

      try {
        const now = isoNow();

        await push(async () => {
          await upsertProfile(user, now);
          assertUser(user.id, generation);
          await upsertCoreState(snapshot, now, user.id);
          assertUser(user.id, generation);
          await upsertAttempts(snapshot, Boolean(options.full), user.id, generation);
          assertUser(user.id, generation);
        });

        lastSyncAt = now;
        lastError = null;
        clearRetry();
        syncStats.recoveries++;
        succeeded = true;
        emitStatus('synced', '云端已同步');
        return true;

      } catch (error) {
        transient = isTransient(error);

        if (generation === userGeneration) {
          recordFailure(error);
          error.syncRecorded = true;

          /* 失败的状态必须放回队列。旧写法在这里什么都不做 ——
             这一次的记录要等到用户下一次操作才会再被同步，
             而「下一次操作」可能很久以后，甚至不会来（用户关掉页面）。 */
          if (!lastQueuedState) {
            lastQueuedState = clone(snapshot);
          }
        }

        throw error;

      } finally {
        /* finally 里释放队列：无论成功、失败还是超时，syncTail 都必须能往前走。
           旧写法在超时（永不 settle）时会让整条链卡死 —— 那才是最难查的一种：
           界面没有任何报错，只是从此再也不同步。

           队列里还有一份新状态时，成功就按正常的防抖节奏补发；
           失败则按退避重排（永久性错误不重排，试再多次也是同一个结果）。 */
        if (generation === userGeneration && lastQueuedState && !syncTimer && !retryTimer) {
          if (succeeded) {
            syncTimer = setTimeout(() => {
              syncTimer = null;
              flushPending();
            }, 900);
          } else if (transient) {
            scheduleRetry();
          }
        }
      }
    });

    syncTail = operation.catch(() => {});
    return operation;
  }

  function queueSync(state) {
    if (!configured() || !currentUser || !state || resetting || !syncReady) {
      return;
    }

    lastQueuedState = clone(state);

    clearTimeout(syncTimer);

    /* 断网时不发这一次请求：它只会以一次超时收场，还要占住整条串行链。
       状态已经进队列了，等 online 事件或退避计时器把它冲刷出去。 */
    if (!isOnline()) {
      emitStatus('offline', '当前离线，学习记录将在联网后自动同步。');
      return;
    }

    syncTimer = setTimeout(() => {
      flushPending();
    }, 900);
  }

  /* 把队列里那一份冲刷出去。联网恢复、退避计时器、页面重新可见都会调它。 */
  function flushPending() {
    if (!lastQueuedState || !configured() || !currentUser || resetting) {
      return Promise.resolve(false);
    }

    clearTimeout(syncTimer);
    clearTimeout(retryTimer);
    retryTimer = null;

    const next = lastQueuedState;
    lastQueuedState = null;

    return syncNow(next).catch(() => false);
  }

  /* 记录一次失败：状态、计数、分类都写全。
     登录后的首次读取也会走到这里 —— 那一步失败如果只把异常抛给调用方，
     界面上就只剩「正在读取云端学习记录…」永远停在那里。 */
  function recordFailure(error) {
    const reason = error?.message || String(error);

    syncStats.failures++;
    syncStats.lastFailureAt = isoNow();
    syncStats.lastFailureReason = reason;
    syncStats.lastFailureKind = failureKind(error);

    if (error?.code === 'SYNC_TIMEOUT') syncStats.timeouts++;

    lastError = reason;
    emitStatus(isOnline() ? 'error' : 'offline', reason);

    return reason;
  }

  async function resolveAfterSignIn(localState) {
    if (!configured() || !currentUser) {
      return localState;
    }

    try {
      return await resolveAfterSignInInner(localState);

    } catch (error) {
      if (error?.message === '账号状态已改变，本次同步已取消。') {
        throw error;
      }

      /* syncNow 内部已经记过一次（它更清楚是哪一步失败），
         这里只兜住「还没记过」的那几类：读云端快照、合并、账号校验。 */
      if (currentUser && !error?.syncRecorded) {
        recordFailure(error);
      }

      throw error;
    }
  }

  async function resolveAfterSignInInner(localState) {
    const userId = currentUser.id;
    const generation = userGeneration;
    emitStatus('loading', '正在读取云端学习记录…');

    const localOwner =
      localState?._meta?.cloudUserId || null;

    const localBelongsToAnotherUser =
      Boolean(
        localOwner &&
        localOwner !== currentUser.id
      );

    // 防止同一浏览器切换账号时，把 A 的学习记录误合并进 B。
    const safeLocalState =
      localBelongsToAnotherUser
        ? {}
        : (localState || {});

    const cloudRow =
      await loadCloudSnapshot(userId);
    assertUser(userId, generation);

    let merged;

    if (!cloudRow?.state_json) {
      merged = clone(safeLocalState);

    } else {
      merged = mergeSnapshots(
        safeLocalState,
        cloudRow.state_json,
        cloudRow.updated_at
      );

      for (const item of cloudRow.state_json.history || []) {
        if (item?.id) syncedAttemptIds.add(item.id);
      }
    }

    merged._meta = {
      ...(merged._meta || {}),
      cloudUserId: currentUser.id,
      localUpdatedAt:
        merged._meta?.localUpdatedAt || isoNow()
    };

    await syncNow(merged, { full: true, bootstrap: true });

    assertUser(userId, generation);
    syncReady = true;
    pendingState = clone(merged);

    return merged;
  }

  function consumePendingState() {
    if (!pendingState) return null;

    const value = clone(pendingState);
    pendingState = null;
    return value;
  }

  async function resetRemote() {
    if (!configured() || !currentUser) return true;

    if (resetting) throw new Error('正在清空，请稍候。');
    resetting = true;
    userGeneration++;
    const generation = userGeneration;
    clearTimeout(syncTimer);
    clearRetry();
    lastQueuedState = null;
    pendingState = null;
    // 等待已经发出的请求结束，再删除，避免旧进度在清空后重新写回。
    await syncTail;
    emitStatus('syncing', '正在清空云端学习记录…');

    const userId = currentUser?.id;
    try {
      assertUser(userId, generation);

      const tables = [
        'attempts',
        'review_queue',
        'checkins',
        'topic_progress',
        'module_progress',
        'user_settings',
        'user_state'
      ];

      for (const table of tables) {
        assertUser(userId, generation);

        /* 清空是一串删除。任何一张表卡住，整次清空就永远不返回 ——
           而调用方在等它，界面停在「正在清空」。超时后按瞬时错误重试一次，
           仍然失败就明确抛出去：清空这种破坏性操作宁可报错，也不能假装完成。 */
        const result = await withRetry(async () => {
          assertUser(userId, generation);
          return client()
            .from(table)
            .delete()
            .eq('user_id', userId);
        }, `清空 ${table}`);

        if (result.error) {
          lastError = result.error.message;
          emitStatus('error', lastError);
          throw new Error(
            `清空 ${table} 失败：${result.error.message}`
          );
        }
      }

      syncedAttemptIds.clear();
      lastSyncAt = isoNow();
      lastError = null;
      assertUser(userId, generation);
      syncReady = true;
      emitStatus('synced', '云端学习记录已清空');

      return true;
    } finally { resetting = false; }
  }

  /* 联网恢复时立即冲刷。断网期间的作答全部躺在队列里，
     等退避计时器（最多 60s）才补上，用户会觉得「记录丢了」。 */
  window.addEventListener('online', () => {
    clearRetry();
    if (lastQueuedState) {
      emitStatus('syncing', '网络已恢复，正在补同步学习记录…');
      flushPending();
    }
  });

  /* 从后台切回来时也补一次：移动端标签页被冻结期间
     setTimeout 不一定会按时触发，退避计时器可能根本没跑。 */
  window.document?.addEventListener?.('visibilitychange', () => {
    if (window.document.visibilityState === 'visible' && lastQueuedState) {
      flushPending();
    }
  });

  window.CalcDailyCloud = {
    configured,
    setUser,
    getUser,
    queueSync,
    flushPending,
    syncNow,
    resolveAfterSignIn,
    consumePendingState,
    resetRemote,
    mergeSnapshots,
    isOnline,

    /* 供本地验收脚本与故障排查读取，不参与业务逻辑。 */
    getSyncState: () => ({
      pending: Boolean(lastQueuedState),
      retryDelayMs,
      retryScheduled: Boolean(retryTimer),
      lastSyncAt,
      lastError,
      online: isOnline(),
      stats: { ...syncStats }
    })
  };
})();

