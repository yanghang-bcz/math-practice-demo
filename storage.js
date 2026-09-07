(() => {
  'use strict';

  const LOCAL_STATE_KEY = 'calcDaily.v2';

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

  function setUser(user) {
    if ((currentUser?.id || null) !== (user?.id || null)) {
      userGeneration++;
      clearTimeout(syncTimer);
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
      instruction: item.instruction || '',
      expression: item.expression || '',
      prompt: item.prompt || '',
      answer: item.answer || '',
      difficultyConfidence:
        item.difficultyConfidence ?? null,
      difficultyDimensions:
        item.difficultyDimensions || null
    };
  }

  function questionJsonFromReview(item) {
    return {
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

    const result = await client()
      .from('user_state')
      .select('state_json, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

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
      try {
        const now = isoNow();
        await upsertProfile(user, now);
        assertUser(user.id, generation);
        await upsertCoreState(snapshot, now, user.id);
        assertUser(user.id, generation);
        await upsertAttempts(snapshot, Boolean(options.full), user.id, generation);
        assertUser(user.id, generation);
        lastSyncAt = now;
        lastError = null;
        emitStatus('synced', '云端已同步');
        return true;
      } catch (error) {
        if (generation === userGeneration) {
          lastError = error.message || String(error);
          emitStatus('error', lastError);
        }
        throw error;
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

    syncTimer = setTimeout(() => {
      const next = lastQueuedState;
      lastQueuedState = null;

      if (next) {
        syncNow(next).catch(() => {});
      }
    }, 900);
  }

  async function resolveAfterSignIn(localState) {
    if (!configured() || !currentUser) {
      return localState;
    }

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
        const result = await client()
          .from(table)
          .delete()
          .eq('user_id', userId);

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

  window.CalcDailyCloud = {
    configured,
    setUser,
    getUser,
    queueSync,
    syncNow,
    resolveAfterSignIn,
    consumePendingState,
    resetRemote,
    mergeSnapshots
  };
})();

