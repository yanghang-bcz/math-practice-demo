(() => {
  'use strict';

  /*
  =========================================================
  CalcDaily Adaptive Engine
  =========================================================
  */

  const STORAGE_KEY = 'calcDaily.v2';
  const LEGACY_STORAGE_KEY = 'calcDaily.v1';

  const MODULES = {
    limit: {
      label: '极限',
      color: '#c96545'
    },

    derivative: {
      label: '导数',
      color: '#627a66'
    },

    integral: {
      label: '积分',
      color: '#88705c'
    }
  };

  const MODULE_KEYS =
    Object.keys(MODULES);


  /*
  =========================================================
  Views
  =========================================================
  */

  const VIEW_META = {
    dashboard: {
      title: '学习分析'
    },

    diagnosis: {
      title: '能力诊断'
    },

    daily: {
      title: ''
    },

    review: {
      title: '错题复习'
    },

    checkin: {
      title: '学习记录'
    },

    settings: {
      title: '设置'
    }
  };


  /*
  =========================================================
  Default state
  =========================================================
  */

  const DEFAULT_STATE = {
    version: 2,

    profile: {
      diagnosed: false,

      diagnosisCompletedAt:
        null,

      placementSource:
        'default',

      abilityByModule: {
        limit: 6,
        derivative: 6,
        integral: 6
      },

      displayLevelByModule: {
        limit: 6,
        derivative: 6,
        integral: 6
      },

      confidenceByModule: {
        limit: 0.15,
        derivative: 0.15,
        integral: 0.15
      },

      effectiveAttemptsByModule: {
        limit: 0,
        derivative: 0,
        integral: 0
      }
    },


    settings: {
      difficultyMode:
        'adaptive',

      manualLevels: {
        limit: 6,
        derivative: 6,
        integral: 6
      },

      trainingMode:
        'balanced',

      dailyCount: 10
    },


    difficultyModel: {
      version:
        'v0-provisional',

      calibrated: false,

      calibrationPoints: [],

      note:
        'Soft-anchor provisional scale. Waiting for real anchor bank.'
    },


    stats: {
      attempts: 0,
      correct: 0,

      byModule: {
        limit: {
          attempts: 0,
          correct: 0
        },

        derivative: {
          attempts: 0,
          correct: 0
        },

        integral: {
          attempts: 0,
          correct: 0
        }
      },

      byTopic: {}
    },


    reviews: [],
    history: [],
    checkins: [],

    activeSession: null,


    dailyMeta: {
      lastCompletedDate:
        null
    }
  };


  let state =
    loadState();

  let currentView =
    'daily';

  let apiHealthy =
    null;

  let apiLastError =
    null;

  /* 协议兼容性（Task 5I）。null = 还没测过；测过之后是一份带 reason 的结论。
     注意「还没测过」和「测过且不匹配」是两回事：前者照常请求（请求里会带回
     版本，逐次校验），后者才走短路径直接退到备用题库。 */
  let apiProtocol =
    null;


  /*
  =========================================================
  Prefetch
  =========================================================
  */

  const sessionPrefetch =
    new Map();

  const warmupPrefetch = {
    daily: null,
    diagnosis: null
  };


  /* ── 请求身份（Task 5E）────────────────────────────────────────

     预取的整个模型是「提前把下一题生成好」。它天然有三个时间差：

       1. 同一次点击可能触发两轮预取（作答后预取一次、切题时再预取一次），
          两轮都以同一个 question_sequence 为键；
       2. 模型返回要 10~40 秒，这中间用户可能已经交了卷、换了模块、结束了这一组题；
       3. 失效的响应落地时，只能被丢弃 —— 不能覆盖更新的，也不能套到另一道题上。

     所以每次预取都带一份身份：request_id（这一次请求）/ session_id（哪一组题）/
     question_sequence（这一组的第几题）。取用时**在 await 前后各核对一次**，
     任何一条对不上就按 STALE_RESPONSE 丢弃并重新生成，绝不将就。
     ========================================================= */

  let requestCounter = 0;

  let prefetchIssued = 0;

  function nextRequestId(
    prefix = 'req'
  ) {
    requestCounter += 1;

    return `${prefix}-${Date.now().toString(36)}-${requestCounter.toString(36)}`;
  }


  /* 新的预取请求能不能顶掉旧的：
     题号更靠后的一定更新（用户已经往前走了）；
     题号相同时，后发出的那个更新（issued 单调递增）。
     反过来 —— 旧请求想覆盖新请求，一律拒绝。 */
  function prefetchSupersedes(
    next,
    previous
  ) {
    if (!previous) {
      return true;
    }

    if (
      next.question_sequence >
      previous.question_sequence
    ) {
      return true;
    }

    if (
      next.question_sequence <
      previous.question_sequence
    ) {
      return false;
    }

    return (
      next.issued >
      previous.issued
    );
  }


  function discardPrefetch(
    entry,
    reason
  ) {
    diagLog({
      level: 'info',
      action: 'prefetch',
      event: 'stale_response_discarded',
      kind: FAILURE_KINDS.STALE_RESPONSE,
      message: reason,
      request_id: entry?.request_id ?? null,
      session_id: entry?.session_id ?? null,
      question_sequence: entry?.question_sequence ?? null,
      outcome: 'discarded'
    });

    return null;
  }

  const difficultyEvaluationTasks =
    new Map();


  /*
  =========================================================
  Diagnostics —— 失败日志与可观测性（Task 5H）
  =========================================================

  可靠性改造最难验收的一点是「出问题时能说清楚是哪一类失败」。
  以前只有一句 console.warn(error)，于是「AI 出题失败」「题目不可信」
  「判题服务连不上」在日志里长得一模一样 —— 事后只能靠猜。

  这里按两层记录：

    每次尝试（per-attempt）   request_id / attempt_id / session_id /
                            question_sequence / 第几次重试 / 耗时 / HTTP 状态
    每道题（per-question）    question_id / module / tier / verification_state /
                            source / 引擎版本 / 最终归宿（生成 or 备用题）

  失败种类用固定的分类表（FAILURE_KINDS），不接受自由文本。
  只存在内存里、有上限，不上报、不写云 —— 这是排障用的，不是埋点。
  window.CalcDailyDiag 供本地验收脚本读取。
  =========================================================
  */

  const DIAG_LIMIT = 200;

  const diagRecords = [];

  const FAILURE_KINDS = {
    GENERATE_TIMEOUT: 'generate_timeout',
    GENERATE_NETWORK: 'generate_network',
    GENERATE_HTTP: 'generate_http_error',
    GENERATE_PROTOCOL: 'generate_protocol_error',
    GENERATE_REJECTED: 'generate_rejected',
    GENERATE_UNVERIFIED: 'generate_unverified',
    GENERATE_EMPTY: 'generate_empty',
    JUDGE_TIMEOUT: 'judge_timeout',
    JUDGE_NETWORK: 'judge_network',
    JUDGE_HTTP: 'judge_http_error',
    JUDGE_PROTOCOL: 'judge_protocol_error',
    JUDGE_UNCERTAIN: 'judge_uncertain',
    PROTOCOL_MISMATCH: 'protocol_mismatch',
    STALE_RESPONSE: 'stale_response',
    FALLBACK_USED: 'fallback_used',
    CANONICAL_MUTATED: 'canonical_mutated',
    SYNC_FAILED: 'sync_failed'
  };


  /* 单条日志。字段一律显式给全（缺的写 null），不要只在「有值的时候」才出现 ——
     日志字段时有时无，聚合脚本就没法写。 */
  function diagLog(
    record
  ) {
    if (!record || typeof record !== 'object') {
      return null;
    }

    const entry = {
      at:
        new Date().toISOString(),

      level:
        record.level || 'info',

      action:
        record.action || null,

      event:
        record.event || null,

      kind:
        record.kind || null,

      message:
        record.message || null,

      // ── 每题 ──
      question_id:
        record.question_id ?? null,

      module:
        record.module ?? null,

      tier:
        record.tier ?? null,

      verification_state:
        record.verification_state ?? null,

      source:
        record.source ?? null,

      /* 用 typeof 守卫而不是可选链：可选链挡不住「标识符本身没声明」
         （会直接 ReferenceError）。引擎没加载时日志还要能写。 */
      math_engine_version:
        record.math_engine_version ??
        (typeof MathQuality !== 'undefined' && MathQuality
          ? MathQuality.VERSION
          : null),

      // ── 每次尝试 ──
      request_id:
        record.request_id ?? null,

      attempt_id:
        record.attempt_id ?? null,

      session_id:
        record.session_id ?? null,

      question_sequence:
        record.question_sequence ?? null,

      attempt:
        record.attempt ?? null,

      retry_index:
        record.retry_index ?? null,

      duration_ms:
        record.duration_ms ?? null,

      http_status:
        record.http_status ?? null,

      outcome:
        record.outcome ?? null,

      fallback:
        record.fallback ?? null
    };

    diagRecords.push(
      entry
    );

    if (diagRecords.length > DIAG_LIMIT) {
      diagRecords.splice(0, diagRecords.length - DIAG_LIMIT);
    }

    if (entry.level === 'error') {
      console.warn('[calcdaily]', entry.action, entry.kind || entry.event || '', entry.message || '');
    } else if (entry.kind) {
      console.log('[calcdaily]', entry.action, entry.kind, entry.message || '');
    }

    return entry;
  }


  function diagSummary() {
    const summary = {
      total: diagRecords.length,
      byKind: {},
      byAction: {},
      byOutcome: {},
      fallbackCount: 0,
      staleDiscarded: 0
    };

    for (const entry of diagRecords) {
      const kind = entry.kind || 'none';
      summary.byKind[kind] = (summary.byKind[kind] || 0) + 1;

      const action = entry.action || 'none';
      summary.byAction[action] = (summary.byAction[action] || 0) + 1;

      if (entry.outcome) {
        summary.byOutcome[entry.outcome] =
          (summary.byOutcome[entry.outcome] || 0) + 1;
      }

      if (entry.fallback === true) summary.fallbackCount += 1;

      if (entry.kind === FAILURE_KINDS.STALE_RESPONSE) summary.staleDiscarded += 1;
    }

    return summary;
  }


  /* 判题「最后一公里」的结论也进日志：判题失败在用户那里表现为
     「点提交没反应」，日志里必须留下可分辨的一行。 */
  function diagJudgeOutcome(
    question,
    result,
    extra = {}
  ) {
    return diagLog({
      level:
        result?.trusted === true ? 'info' : 'error',

      action: 'judge',
      event: 'verdict',
      kind:
        result?.trusted === true
          ? null
          : (result?.reason === MathQuality.JUDGE_REASONS.JUDGE_UNAVAILABLE
              ? FAILURE_KINDS.JUDGE_NETWORK
              : FAILURE_KINDS.JUDGE_UNCERTAIN),
      message:
        result?.trusted === true
          ? (result.correct ? 'equivalent' : 'not_equivalent')
          : String(result?.reason || 'untrusted'),
      question_id: question?.question_id || question?.id || null,
      module: question?.module || null,
      tier: question?.tier ?? null,
      verification_state: question?.verification_state ?? null,
      source: question?.source || null,
      outcome:
        result?.trusted === true
          ? (result.correct ? 'correct' : 'wrong')
          : 'judge_failed',
      ...extra
    });
  }


  window.CalcDailyDiag = {
    dump: () => diagRecords.slice(),
    summary: diagSummary,
    kinds: FAILURE_KINDS,
    limit: DIAG_LIMIT,

    clear() {
      const n = diagRecords.length;
      diagRecords.length = 0;
      return n;
    }
  };


  /* 云同步的状态本来只发一个 CustomEvent，界面上没有任何人去听它 ——
     于是「学习记录再也同步不上去」这件事对用户和对我们一样不可见。
     这里做两件事：进诊断日志；失败时用已有的 toast 提示一次（30 秒节流）。

     提示只说「记录还在、稍后会自动补上」，不提同步细节 ——
     用户需要知道的不是重试了几次，而是他的作答没有丢。 */
  const SYNC_NOTICE_THROTTLE_MS = 30000;

  let lastSyncNoticeAt = 0;


  window.addEventListener(
    'calcdaily:sync-status',
    event => {
      const detail = event?.detail || {};
      const status = detail.status || 'unknown';

      if (status !== 'error' && status !== 'offline') {
        if (status === 'synced') {
          diagLog({
            level: 'info',
            action: 'sync',
            event: 'sync_status',
            message: 'cloud_synced',
            outcome: 'ok'
          });
        }

        return;
      }

      diagLog({
        level: 'error',
        action: 'sync',
        event: 'sync_status',
        kind: FAILURE_KINDS.SYNC_FAILED,
        message: detail.message || status,
        outcome: status
      });

      const now = Date.now();

      if (now - lastSyncNoticeAt < SYNC_NOTICE_THROTTLE_MS) {
        return;
      }

      lastSyncNoticeAt = now;

      toast(
        status === 'offline'
          ? '当前网络不可用，学习记录已暂存在本机，联网后会自动补同步。'
          : '云端同步暂时失败，学习记录已存在本机，稍后会自动重试。'
      );
    }
  );


  /*
  =========================================================
  DOM helpers
  =========================================================
  */

  const $ =
    id =>
      document.getElementById(
        id
      );

  const $$ =
    selector =>
      Array.from(
        document.querySelectorAll(
          selector
        )
      );


  function deepClone(obj) {
    return JSON.parse(
      JSON.stringify(obj)
    );
  }


  function clamp(
    n,
    min,
    max
  ) {
    return Math.min(
      max,
      Math.max(
        min,
        n
      )
    );
  }


  function round2(n) {
    return (
      Math.round(
        Number(n) * 100
      ) / 100
    );
  }


  function uid(
    prefix = 'id'
  ) {
    return (
      `${prefix}_` +
      `${Date.now().toString(36)}_` +
      Math.random()
        .toString(36)
        .slice(2, 8)
    );
  }


  /*
  =========================================================
  Date helpers
  =========================================================
  */

  function todayISO() {
    const d =
      new Date();

    const y =
      d.getFullYear();

    const m =
      String(
        d.getMonth() + 1
      ).padStart(
        2,
        '0'
      );

    const day =
      String(
        d.getDate()
      ).padStart(
        2,
        '0'
      );

    return `${y}-${m}-${day}`;
  }


  function dateOffsetISO(
    offset
  ) {
    const d =
      new Date();

    d.setHours(
      12,
      0,
      0,
      0
    );

    d.setDate(
      d.getDate() +
      offset
    );

    const y =
      d.getFullYear();

    const m =
      String(
        d.getMonth() + 1
      ).padStart(
        2,
        '0'
      );

    const day =
      String(
        d.getDate()
      ).padStart(
        2,
        '0'
      );

    return `${y}-${m}-${day}`;
  }


  function addDaysISO(
    days
  ) {
    return dateOffsetISO(
      days
    );
  }


  function formatDateCN(
    date = new Date()
  ) {
    return new Intl
      .DateTimeFormat(
        'zh-CN',
        {
          month:
            'long',

          day:
            'numeric',

          weekday:
            'short'
        }
      )
      .format(date);
  }


  function formatDateTimeShort(
    value
  ) {
    if (!value) {
      return '—';
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return '—';
    }

    return new Intl
      .DateTimeFormat(
        'zh-CN',
        {
          month:
            'numeric',

          day:
            'numeric',

          hour:
            '2-digit',

          minute:
            '2-digit'
        }
      )
      .format(date);
  }


  function formatReviewDate(
    value
  ) {
    if (!value) {
      return '已完成高频复习';
    }

    const today =
      todayISO();

    if (
      value < today
    ) {
      return (
        `已到期 · ${value}`
      );
    }

    if (
      value === today
    ) {
      return '今天到期';
    }

    return `${value} 复习`;
  }


  /*
  =========================================================
  User-facing greeting
  =========================================================
  */

  function currentDisplayName() {
    const user =
      window
        .CalcDailyCloud
        ?.getUser?.();

    if (!user) {
      return '';
    }

    return String(
      user
        ?.user_metadata
        ?.display_name ||
      user?.nickname ||
      user?.name ||
      ''
    ).trim();
  }


  function greetingText() {
    const hour =
      new Date()
        .getHours();

    let greeting =
      '你好';

    if (hour < 11) {
      greeting =
        '早上好';

    } else if (
      hour < 18
    ) {
      greeting =
        '下午好';

    } else {
      greeting =
        '晚上好';
    }

    const name =
      currentDisplayName();

    return name
      ? `${greeting}，${name}。`
      : `${greeting}。`;
  }


  function shouldOfferDiagnosis() {
    return (
      !state.profile.diagnosed &&
      state.profile
        .placementSource ===
        'default'
    );
  }


  /*
  =========================================================
  General helpers
  =========================================================
  */

  function escapeHTML(
    value = ''
  ) {
    return String(value)
      .replaceAll(
        '&',
        '&amp;'
      )
      .replaceAll(
        '<',
        '&lt;'
      )
      .replaceAll(
        '>',
        '&gt;'
      )
      .replaceAll(
        '"',
        '&quot;'
      )
      .replaceAll(
        "'",
        '&#039;'
      );
  }


  function accuracy(
    correct,
    attempts
  ) {
    return attempts
      ? Math.round(
          (
            correct /
            attempts
          ) * 100
        )
      : null;
  }


  function moduleLabel(
    key
  ) {
    return (
      MODULES[key]?.label ||
      key
    );
  }


  function topicKey(
    question
  ) {
    return (
      `${question.module}:` +
      `${
        question.topic ||
        '综合基础'
      }`
    );
  }


  function getTopicStat(
    module,
    topic
  ) {
    return (
      state
        .stats
        .byTopic[
          `${module}:${topic}`
        ] ||
      null
    );
  }


  function toast(
    message
  ) {
    const el =
      $('toast');

    if (!el) {
      return;
    }

    el.textContent =
      message;

    el.classList.remove(
      'opacity-0',
      'translate-y-3'
    );

    el.classList.add(
      'opacity-100',
      'translate-y-0'
    );

    clearTimeout(
      toast._timer
    );

    toast._timer =
      setTimeout(
        () => {
          el.classList.add(
            'opacity-0',
            'translate-y-3'
          );

          el.classList.remove(
            'opacity-100',
            'translate-y-0'
          );
        },
        2200
      );
  }


  /*
  =========================================================
  Storage
  =========================================================
  */

  function mergeState(
    parsed
  ) {
    const base =
      deepClone(
        DEFAULT_STATE
      );

    return {
      ...base,
      ...parsed,

      profile: {
        ...base.profile,
        ...(parsed.profile || {}),

        abilityByModule: {
          ...base
            .profile
            .abilityByModule,

          ...(
            (
              parsed.profile ||
              {}
            )
              .abilityByModule ||
            {}
          )
        },

        displayLevelByModule: {
          ...base
            .profile
            .displayLevelByModule,

          ...(
            (
              parsed.profile ||
              {}
            )
              .displayLevelByModule ||
            {}
          )
        },

        confidenceByModule: {
          ...base
            .profile
            .confidenceByModule,

          ...(
            (
              parsed.profile ||
              {}
            )
              .confidenceByModule ||
            {}
          )
        },

        effectiveAttemptsByModule: {
          ...base
            .profile
            .effectiveAttemptsByModule,

          ...(
            (
              parsed.profile ||
              {}
            )
              .effectiveAttemptsByModule ||
            {}
          )
        }
      },


      settings: {
        ...base.settings,
        ...(parsed.settings || {}),

        manualLevels: {
          ...base
            .settings
            .manualLevels,

          ...(
            (
              parsed.settings ||
              {}
            )
              .manualLevels ||
            {}
          )
        }
      },


      difficultyModel: {
        ...base
          .difficultyModel,

        ...(
          parsed
            .difficultyModel ||
          {}
        )
      },


      stats: {
        ...base.stats,
        ...(parsed.stats || {}),

        byModule: {
          ...base
            .stats
            .byModule,

          ...(
            (
              parsed.stats ||
              {}
            )
              .byModule ||
            {}
          )
        },

        byTopic: {
          ...(
            (
              parsed.stats ||
              {}
            )
              .byTopic ||
            {}
          )
        }
      },


      reviews:
        Array.isArray(
          parsed.reviews
        )
          ? parsed.reviews
          : [],

      history:
        Array.isArray(
          parsed.history
        )
          ? parsed.history
          : [],

      checkins:
        Array.isArray(
          parsed.checkins
        )
          ? parsed.checkins
          : []
    };
  }


  function migrateLegacyState(
    legacy
  ) {
    const next =
      deepClone(
        DEFAULT_STATE
      );

    next
      .profile
      .diagnosed =
        Boolean(
          legacy
            ?.profile
            ?.diagnosed
        );

    next
      .profile
      .diagnosisCompletedAt =
        legacy
          ?.profile
          ?.diagnosisCompletedAt ||
        null;


    MODULE_KEYS.forEach(
      module => {
        const oldLevel =
          Number(
            legacy
              ?.profile
              ?.levelByModule
              ?.[module]
          );

        if (
          Number.isFinite(
            oldLevel
          )
        ) {
          const level =
            clamp(
              oldLevel,
              1,
              12
            );

          next
            .profile
            .abilityByModule[
              module
            ] =
              level;

          next
            .profile
            .displayLevelByModule[
              module
            ] =
              Math.round(
                level
              );

          next
            .settings
            .manualLevels[
              module
            ] =
              Math.round(
                level
              );
        }
      }
    );


    if (
      legacy?.stats
    ) {
      next
        .stats
        .attempts =
          Number(
            legacy
              .stats
              .attempts
          ) || 0;

      next
        .stats
        .correct =
          Number(
            legacy
              .stats
              .correct
          ) || 0;


      MODULE_KEYS.forEach(
        module => {
          next
            .stats
            .byModule[
              module
            ] = {
              attempts:
                Number(
                  legacy
                    .stats
                    .byModule
                    ?.[module]
                    ?.attempts
                ) || 0,

              correct:
                Number(
                  legacy
                    .stats
                    .byModule
                    ?.[module]
                    ?.correct
                ) || 0
            };


          next
            .profile
            .effectiveAttemptsByModule[
              module
            ] =
              next
                .stats
                .byModule[
                  module
                ]
                .attempts;
        }
      );


      next
        .stats
        .byTopic =
          legacy
            .stats
            .byTopic ||
          {};
    }


    next.reviews =
      Array.isArray(
        legacy.reviews
      )
        ? legacy.reviews
        : [];


    next.history =
      Array.isArray(
        legacy.history
      )
        ? legacy.history
        : [];


    next.checkins =
      Array.isArray(
        legacy.checkins
      )
        ? legacy.checkins
        : [];


    next.dailyMeta =
      legacy.dailyMeta ||
      next.dailyMeta;


    next.activeSession =
      null;


    next
      .profile
      .placementSource =
        next
          .profile
          .diagnosed
          ? 'legacy-diagnosis'
          : 'legacy';


    return next;
  }


  function loadState() {
    try {
      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );

      if (raw) {
        return mergeState(
          JSON.parse(raw)
        );
      }


      const legacyRaw =
        localStorage.getItem(
          LEGACY_STORAGE_KEY
        );

      if (legacyRaw) {
        const migrated =
          migrateLegacyState(
            JSON.parse(
              legacyRaw
            )
          );

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(
            migrated
          )
        );

        return migrated;
      }


      return deepClone(
        DEFAULT_STATE
      );

    } catch (error) {
      console.warn(
        'LocalStorage 数据读取失败，已使用默认状态。',
        error
      );

      return deepClone(
        DEFAULT_STATE
      );
    }
  }


  function saveState(
    options = {}
  ) {
    const {
      skipCloud = false,
      touchTimestamp = true
    } = options;


    if (
      touchTimestamp
    ) {
      const cloudUserId =
        window
          .CalcDailyCloud
          ?.getUser?.()
          ?.id ||
        null;


      state._meta = {
        ...(state._meta || {}),

        localUpdatedAt:
          new Date()
            .toISOString(),

        ...(
          cloudUserId
            ? {
                cloudUserId
              }
            : {}
        )
      };
    }


    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        state
      )
    );


    if (!skipCloud) {
      window
        .CalcDailyCloud
        ?.queueSync?.(
          deepClone(state)
        );
    }
  }


  function applyCloudState(
    nextState
  ) {
    if (
      !nextState ||
      typeof nextState !==
        'object'
    ) {
      return;
    }


    state =
      mergeState(
        nextState
      );


    if (
      !state.activeSession
    ) {
      state.activeSession =
        null;
    }


    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        state
      )
    );


    sessionPrefetch.clear();

    warmupPrefetch.daily =
      null;

    warmupPrefetch.diagnosis =
      null;


    renderAll();

    switchView(
      currentView
    );

    toast(
      '云端学习记录已同步'
    );
  }


  window.CalcDailyApp = {
    getState() {
      return deepClone(
        state
      );
    },

    applyCloudState,

    syncNow() {
      return window
        .CalcDailyCloud
        ?.syncNow?.(
          deepClone(
            state
          )
        );
    }
  };


  /*
  =========================================================
  Math rendering
  =========================================================
  */

  async function typesetMath(
    container =
      document.body
  ) {
    try {
      if (
        window
          .MathJax
          ?.typesetPromise
      ) {
        if (
          window
            .MathJax
            .typesetClear
        ) {
          window
            .MathJax
            .typesetClear(
              [container]
            );
        }

        await window
          .MathJax
          .typesetPromise(
            [container]
          );
      }

    } catch (error) {
      console.warn(
        'MathJax 渲染失败',
        error
      );
    }
  }


  function stripMathDelimiters(
    value = ''
  ) {
    let s =
      String(value)
        .trim();

    const pairs = [
      ['\\[', '\\]'],
      ['\\(', '\\)'],
      ['$$', '$$'],
      ['$', '$']
    ];


    for (
      const [
        left,
        right
      ] of pairs
    ) {
      if (
        s.startsWith(
          left
        ) &&
        s.endsWith(
          right
        )
      ) {
        s =
          s.slice(
            left.length,
            -right.length
          ).trim();
      }
    }

    return s;
  }


  function hasMathDelimiter(
    text = ''
  ) {
    return (
      /\\\(|\\\[|\$\$|(^|[^\\])\$/
        .test(
          String(text)
        )
    );
  }


  function hasRawLatex(
    text = ''
  ) {
    return (
      /\\(?:lim|frac|dfrac|tfrac|int|sum|prod|sqrt|sin|cos|tan|cot|sec|csc|ln|log|exp|to|infty|partial|cdot|times|left|right|begin|end)/
        .test(
          String(text)
        )
    );
  }


  function smartRichMathHTML(
    value = ''
  ) {
    const raw =
      String(
        value || ''
      ).trim();

    if (!raw) {
      return '';
    }


    if (
      hasMathDelimiter(
        raw
      )
    ) {
      return (
        `<div class="math-inline-wrap">` +
        escapeHTML(raw)
          .replace(
            /\n/g,
            '<br>'
          ) +
        `</div>`
      );
    }


    if (
      hasRawLatex(
        raw
      )
    ) {
      const firstCommand =
        raw.search(
          /\\(?:lim|frac|dfrac|tfrac|int|sum|prod|sqrt|sin|cos|tan|ln|log|exp|partial)/
        );

      const colonIndex =
        Math.max(
          raw.lastIndexOf(
            '：',
            firstCommand
          ),

          raw.lastIndexOf(
            ':',
            firstCommand
          )
        );


      if (
        colonIndex >= 0 &&
        firstCommand >
          colonIndex
      ) {
        const prefix =
          raw.slice(
            0,
            colonIndex + 1
          );

        const expression =
          raw.slice(
            colonIndex + 1
          ).trim();


        return `
          <div>
            ${escapeHTML(prefix)}
          </div>

          <div class="math-block">
            \\[
              ${escapeHTML(
                stripMathDelimiters(
                  expression
                )
              )}
            \\]
          </div>
        `;
      }


      return `
        <div class="math-block">
          \\[
            ${escapeHTML(
              stripMathDelimiters(
                raw
              )
            )}
          \\]
        </div>
      `;
    }


    return (
      `<div>` +
      escapeHTML(raw)
        .replace(
          /\n/g,
          '<br>'
        ) +
      `</div>`
    );
  }


  function questionPromptHTML(
    question
  ) {
    if (
      question?.instruction &&
      question?.expression
    ) {
      return `
        <div class="
          text-[15px]
          leading-7
          text-ink

          sm:text-base
        ">
          ${escapeHTML(
            question.instruction
          )}
        </div>

        <div class="
          math-block
          mt-3
          text-lg

          sm:text-xl
        ">
          \\[
            ${escapeHTML(
              stripMathDelimiters(
                question.expression
              )
            )}
          \\]
        </div>
      `;
    }


    return smartRichMathHTML(
      question?.prompt ||
      '题目加载失败'
    );
  }


  function answerMathHTML(
    answer
  ) {
    const value =
      stripMathDelimiters(
        answer || ''
      );

    if (!value) {
      return '—';
    }

    return (
      `<span class="math-inline-wrap">` +
      `\\(${escapeHTML(value)}\\)` +
      `</span>`
    );
  }


  /*
  =========================================================
  API
  =========================================================
  */

  const AI_API_URL =
    'https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek';


  /* ── 超时 / 重试 / 退避（Task 5F）──────────────────────────────

     旧的预算是 generate 190 秒、其余 50 秒，而且**一次都不重试**。
     这套预算有两头都不对：

       1. 190 秒是照着服务端「两次生成 + 两次复核」的最坏情况配的。
          真走到那一步，用户对着「正在准备题目…」等三分多钟 —— 而这段时间里
          备用题库本来可以立刻给出一道已校验的题。宁可少一道动态题，
          也不要让用户干等。
       2. 一次都不重试，意味着一次握手抖动（DNS、连接被重置、CDN 502）
          就直接掉进备用题 —— 明明再试一次就成功了。

     新预算按「服务端一次往返的真实耗时」定，而不是照着它的最坏情况：

       generate  60s      服务端典型 15~35s（含一次复核失败重来）
       judge     22s      服务端判题预算已收到 20s
       evaluate  25s      难度标定，失败不影响出题

     重试策略刻意不对称：
       · 判题：任何可重试失败都重试 1 次（含超时）—— 预算小，值得再试
       · 出题：超时**不**重试。超时说明服务已经吃力，再等一个满额超时
         只会把等待翻倍；这一路的正确处置是立刻退到备用题库。
         连接类失败（握手抖动、5xx、429）才重试，这类失败几乎不耗时。
     ========================================================= */

  const API_TIMEOUTS = {
    generate: 60000,
    judge: 22000,
    evaluate: 25000
  };

  const API_RETRY = {
    generate: { attempts: 2 },
    judge: { attempts: 2 },
    evaluate: { attempts: 1 }
  };

  /* 整体预算（wall-clock deadline）。每次超时都只是「这一次」的上限，
     真正决定用户等多久的是「这一次 + 退避 + 下一次」。把总预算钉死，
     才对得上「不再出现 180~190 秒等待」这条要求：

       generate  90s   最坏 = 一次快速失败 + 退避 + 一次满额超时
       judge     45s   最坏 = 两次 22s
       evaluate  25s   标定失败不影响出题，没有必要等更久

     超预算时不再重试，直接把这次失败抛出去 —— 由上层决定退到备用题库。
     让用户为「再试一次」多等一分钟，比直接给一道已校验的备用题糟得多。 */
  const API_BUDGETS = {
    generate: 90000,
    judge: 45000,
    evaluate: 25000
  };

  const RETRY_BASE_MS = 600;

  const RETRY_JITTER_MS = 600;

  const sleep = ms =>
    new Promise(
      resolve =>
        setTimeout(
          resolve,
          ms
        )
    );


  /* 退避固定落在 600~1200ms：太短等于连打服务端，太长不如直接走备用题。
     抖动是必要的 —— 多标签页同时失败时不该在同一毫秒一起回来。 */
  function retryDelay(
    retryIndex = 0
  ) {
    return Math.round(
      RETRY_BASE_MS +
      Math.random() * RETRY_JITTER_MS
    );
  }


  function apiTimeoutError(
    action,
    timeoutMs
  ) {
    const error = new Error(
      action === 'judge'
        ? `判题请求超时（${Math.round(timeoutMs / 1000)}s）`
        : `AI 请求超时（${Math.round(timeoutMs / 1000)}s）`
    );

    error.name = 'TimeoutError';
    error.code = 'CLIENT_TIMEOUT';
    error.timeoutMs = timeoutMs;
    error.httpStatus = null;

    return error;
  }


  function apiFailureKind(
    action,
    error
  ) {
    const judge =
      action === 'judge';

    if (error?.httpStatus) {
      return judge
        ? FAILURE_KINDS.JUDGE_HTTP
        : FAILURE_KINDS.GENERATE_HTTP;
    }

    if (
      error?.name === 'AbortError' ||
      error?.name === 'TimeoutError' ||
      error?.code === 'CLIENT_TIMEOUT'
    ) {
      return judge
        ? FAILURE_KINDS.JUDGE_TIMEOUT
        : FAILURE_KINDS.GENERATE_TIMEOUT;
    }

    if (error?.code === 'CLIENT_PROTOCOL_ERROR') {
      return judge
        ? FAILURE_KINDS.JUDGE_PROTOCOL
        : FAILURE_KINDS.GENERATE_PROTOCOL;
    }

    return judge
      ? FAILURE_KINDS.JUDGE_NETWORK
      : FAILURE_KINDS.GENERATE_NETWORK;
  }


  /* 400/401/403/404 这类错误重试多少次都是同一个结果，直接抛；
     429、5xx、超时、连接中断才值得再来一次。 */
  function apiRetryable(
    action,
    error
  ) {
    const status =
      Number(error?.httpStatus);

    if (
      Number.isFinite(status) &&
      error?.httpStatus !== null
    ) {
      return (
        status === 429 ||
        status === 408 ||
        status >= 500
      );
    }

    if (error?.code === 'CLIENT_PROTOCOL_ERROR') {
      return false;
    }

    const timedOut =
      error?.name === 'AbortError' ||
      error?.name === 'TimeoutError' ||
      error?.code === 'CLIENT_TIMEOUT';

    // 出题不重试超时：重试会把等待翻倍，而备用题库立刻就能兜住（见上）
    if (timedOut && action === 'generate') {
      return false;
    }

    return true;
  }


  async function apiCall(
    action,
    payload = {},
    options = {}
  ) {
    const timeoutMs =
      Number(options.timeoutMs) ||
      API_TIMEOUTS[action] ||
      25000;

    const attempts =
      Math.max(
        1,
        Number(options.attempts) ||
        API_RETRY[action]?.attempts ||
        1
      );

    const requestId =
      payload.request_id ||
      nextRequestId(action);

    const attemptId =
      nextRequestId('attempt');

    const budgetMs =
      Number(options.budgetMs) ||
      API_BUDGETS[action] ||
      timeoutMs;

    const deadline =
      Date.now() + budgetMs;

    let lastError =
      null;

    for (
      let attempt = 0;
      attempt < attempts;
      attempt++
    ) {
      if (attempt > 0) {
        const delay =
          retryDelay(attempt - 1);

        if (Date.now() + delay + 1000 > deadline) {
          diagLog({
            level: 'error',
            action,
            event: 'retry_skipped',
            kind: apiFailureKind(action, lastError),
            message: '整体预算不足，不再重试',
            request_id: requestId,
            attempt_id: attemptId,
            attempt: attempt + 1,
            retry_index: attempt,
            duration_ms: Date.now() - (deadline - budgetMs),
            outcome: 'budget_exhausted'
          });

          break;
        }

        await sleep(
          delay
        );
      }

      const startedAt =
        Date.now();

      const remaining =
        deadline - startedAt;

      if (remaining <= 1000) {
        break;
      }

      /* 单次超时不超过剩余预算，否则「总预算」只是个装饰。
         下限 1 秒：低于它的超时会把正常的往返也掐掉，等于把「慢」误报成「断」。 */
      const attemptTimeout =
        Math.max(
          1000,
          Math.min(timeoutMs, remaining)
        );

      const controller =
        new AbortController();

      const timer =
        setTimeout(
          () => controller.abort(),
          attemptTimeout
        );

      try {
        const response =
          await fetch(
            AI_API_URL,
            {
              method: 'POST',
              signal: controller.signal,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action,
                request_id: requestId,
                session_id: payload.session_id ?? null,
                question_sequence: payload.question_sequence ?? null,
                attempt: attempt + 1,
                ...payload
              })
            }
          );

        const data =
          await response
            .json()
            .catch(
              () => null
            );

        if (!response.ok) {
          const error = new Error(
            data?.error ||
            `AI 请求失败 (${response.status})`
          );

          error.httpStatus =
            response.status;

          error.code =
            data?.code || null;

          throw error;
        }

        if (!data) {
          const error =
            new Error('AI 返回体不是 JSON');

          error.code = 'CLIENT_PROTOCOL_ERROR';
          error.httpStatus = null;

          throw error;
        }

        diagLog({
          level: 'info',
          action,
          event: 'http_attempt',
          message: `ok attempt ${attempt + 1}/${attempts}`,
          request_id: requestId,
          attempt_id: attemptId,
          session_id: payload.session_id ?? null,
          question_sequence: payload.question_sequence ?? null,
          attempt: attempt + 1,
          retry_index: attempt,
          duration_ms: Date.now() - startedAt,
          http_status: response.status,
          outcome: 'ok'
        });

        return data;

      } catch (caught) {
        const aborted =
          caught?.name === 'AbortError';

        const error =
          aborted
            ? apiTimeoutError(action, attemptTimeout)
            : caught;

        const retryable =
          apiRetryable(action, error);

        const willRetry =
          retryable &&
          attempt + 1 < attempts;

        diagLog({
          level: 'error',
          action,
          event: 'http_attempt',
          kind: apiFailureKind(action, error),
          message: error?.message || String(error),
          request_id: requestId,
          attempt_id: attemptId,
          session_id: payload.session_id ?? null,
          question_sequence: payload.question_sequence ?? null,
          attempt: attempt + 1,
          retry_index: attempt,
          duration_ms: Date.now() - startedAt,
          http_status: error?.httpStatus ?? null,
          outcome: willRetry ? 'retry' : 'failed'
        });

        lastError = error;

        if (!willRetry) {
          break;
        }

      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ||
      new Error('AI 请求失败');
  }


  /* ── 协议与版本（Task 5I）────────────────────────────────────

     旧的健康检查只做一件事：res.ok。于是不管线上跑的是哪一版引擎，
     界面都显示「DeepSeek 已连接」—— 而「连上了」和「连上了一个能按
     当前规则判题的版本」是两件完全不同的事。

     版本不匹配有两种后果，且都真实发生过：
       · 出题侧：服务端按旧规则标记 verification，客户端按新规则校验直接
         判它 stale，用户看到「AI 出题失败，已使用备用题」，但根本原因
         其实是劈叉部署，而不是模型不行；
       · 判题侧：旧服务端可能对某些形态给出「确定等价」的结论，而新客户端
         的引擎根本没法独立复核它 —— 这就是「错答放行」的入口。

     所以：
       1. 启动时读 health，比对五个版本，结论挂在界面上（不再只说「已连接」）；
       2. 每一次请求的响应里都带 versions，**逐次**校验。启动时对得上、返回时
          对不上（灰度、多实例、CDN 缓存）也必须拦。
     ========================================================= */

  const HEALTH_TIMEOUT_MS = 8000;

  function clientPipeline() {
    return {
      protocol: 2,
      generator: 'generator-v2',
      reviewer: 'reviewer-v2',
      judge: 'judge-v2',
      engine:
        typeof MathQuality !== 'undefined' && MathQuality
          ? MathQuality.VERSION
          : null
    };
  }


  function pipelineMismatch(
    actual
  ) {
    const expected =
      clientPipeline();

    if (!actual || typeof actual !== 'object') {
      return {
        ok: false,
        reason: 'missing_versions',
        expected,
        actual: null,
        message: '响应里没有版本信息'
      };
    }

    /* 引擎版本是第一位的：验证规则由它决定。引擎不同，服务端的
       verification 与本机的 content/形态判定就可能不是同一套。 */
    const actualEngine =
      actual.math_engine ??
      actual.engine ??
      null;

    if (actualEngine !== expected.engine) {
      return {
        ok: false,
        reason: 'engine_version_mismatch',
        expected,
        actual: actualEngine,
        message: `数学引擎版本不一致（本机 ${expected.engine || '未知'} / 服务端 ${actualEngine || '未知'}）`
      };
    }

    const actualProtocol =
      actual.protocol ??
      null;

    if (Number(actualProtocol) !== Number(expected.protocol)) {
      return {
        ok: false,
        reason: 'protocol_version_mismatch',
        expected,
        actual: actualProtocol,
        message: `接口协议版本不一致（本机 v${expected.protocol} / 服务端 v${actualProtocol ?? '未知'}）`
      };
    }

    return {
      ok: true,
      reason: 'match',
      expected,
      actual,
      message: `协议 v${expected.protocol} · 引擎 ${expected.engine}`
    };
  }


  /* 逐次校验：响应里的 versions（出错响应一直带着它，成功响应 Task 5I 起也带）。 */
  function checkResponseProtocol(
    data
  ) {
    return pipelineMismatch(
      data?.versions ||
      data?.pipeline ||
      null
    );
  }


  /* 「已经确定不匹配」才走短路径。还没测过（apiProtocol === null）不拦 ——
     否则每次冷启动的头几秒都只能拿到备用题。 */
  function knownProtocolMismatch() {
    return Boolean(
      apiProtocol &&
      apiProtocol.ok === false &&
      [
        'engine_version_mismatch',
        'protocol_version_mismatch'
      ].includes(
        apiProtocol.reason
      )
    );
  }


  async function checkApiHealth() {
    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () => controller.abort(),
        HEALTH_TIMEOUT_MS
      );

    try {
      const res =
        await fetch(
          `${AI_API_URL}?health=1`,
          {
            cache:
              'no-store',

            signal:
              controller.signal
          }
        );

      const data =
        await res
          .json()
          .catch(
            () => null
          );

      apiHealthy =
        res.ok &&
        data?.ok !== false;

      const mismatch =
        pipelineMismatch(
          data?.pipeline ||
          (data && data.protocol_version !== undefined
            ? {
                protocol: data.protocol_version,
                generator: data.generator_version,
                reviewer: data.reviewer_version,
                judge: data.judge_version,
                math_engine: data.math_engine_version
              }
            : null)
        );

      apiProtocol = {
        ...mismatch,
        checkedAt: new Date().toISOString(),
        httpOk: res.ok
      };

      if (!mismatch.ok) {
        diagLog({
          level: 'error',
          action: 'health',
          event: 'protocol_check',
          kind: FAILURE_KINDS.PROTOCOL_MISMATCH,
          message: mismatch.message,
          http_status: res.status,
          outcome: 'mismatch'
        });
      } else {
        diagLog({
          level: 'info',
          action: 'health',
          event: 'protocol_check',
          message: mismatch.message,
          http_status: res.status,
          outcome: 'ok'
        });
      }

    } catch (error) {
      apiHealthy =
        false;

      /* 连不上不是「协议不匹配」—— 不能因为一次网络抖动就把出题路径
         永久切到备用题库。这里只记 ok:null，出题照常尝试。 */
      apiProtocol = {
        ok: null,
        reason: error?.name === 'AbortError' ? 'health_timeout' : 'unreachable',
        expected: clientPipeline(),
        actual: null,
        message: '健康检查没拿到响应',
        checkedAt: new Date().toISOString(),
        httpOk: false
      };

      diagLog({
        level: 'error',
        action: 'health',
        event: 'protocol_check',
        kind: error?.name === 'AbortError' ? FAILURE_KINDS.GENERATE_TIMEOUT : FAILURE_KINDS.GENERATE_NETWORK,
        message: error?.message || String(error),
        outcome: 'unreachable'
      });

    } finally {
      clearTimeout(timer);
    }

    renderApiStatus();
  }


  function shortApiError(
    error
  ) {
    const raw =
      String(
        error?.message ||
        error ||
        '请求失败'
      ).trim();


    if (
      /402|余额|balance|insufficient/i
        .test(raw)
    ) {
      return '余额不足';
    }


    if (
      /401|api.?key|unauthor/i
        .test(raw)
    ) {
      return 'API Key 无效';
    }


    if (
      /429|rate|频率|too many/i
        .test(raw)
    ) {
      return '请求过于频繁';
    }


    if (
      /503|overload|繁忙|unavailable/i
        .test(raw)
    ) {
      return '服务暂时繁忙';
    }


    if (
      /timeout|timed out|超时/i
        .test(raw)
    ) {
      return '请求超时';
    }


    return (
      raw.length > 28
        ? `${raw.slice(
            0,
            28
          )}…`
        : raw
    );
  }


  function markApiRequestSuccess() {
    apiHealthy =
      true;

    apiLastError =
      null;

    renderApiStatus();
  }


  function markApiRequestFailure(
    error
  ) {
    apiLastError =
      shortApiError(
        error
      );

    renderApiStatus();

    checkApiHealth()
      .catch(
        () => {}
      );
  }


  function renderApiStatus() {
    const text =
      $('apiStatusText');

    const dot =
      $('apiStatusDot');

    if (
      !text ||
      !dot
    ) {
      return;
    }


    /* 「连上了」和「连上了一个按当前规则判题的版本」不是一回事（Task 5I）。
       劈叉部署时最危险的状态恰恰是「连接正常」—— 界面越平静，问题越难被发现。 */
    if (
      apiProtocol &&
      apiProtocol.ok === false
    ) {
      text.textContent =
        `后端版本不匹配 · ${apiProtocol.message}（已改用备用题库）`;

      dot.className =
        'h-2 w-2 rounded-full bg-rose-500';

      return;
    }


    if (
      apiHealthy === true &&
      apiLastError
    ) {
      text.textContent =
        `已连接 · 最近请求失败：${apiLastError}`;

      dot.className =
        'h-2 w-2 rounded-full bg-amber-400';

      return;
    }


    if (
      apiHealthy === true
    ) {
      const version =
        apiProtocol?.ok === true
          ? ` · 协议 v${apiProtocol.expected.protocol}`
          : '';

      text.textContent =
        `DeepSeek 已连接${version}`;

      dot.className =
        'h-2 w-2 rounded-full bg-emerald-500';

      return;
    }


    if (
      apiHealthy === false
    ) {
      text.textContent =
        'AI 服务未连接';

      dot.className =
        'h-2 w-2 rounded-full bg-amber-400';

      return;
    }


    text.textContent =
      '检测中';

    dot.className =
      'h-2 w-2 rounded-full bg-amber-400';
  }


  /*
  =========================================================
  Difficulty model
  =========================================================
  */

  function correctProbability(
    theta,
    difficulty
  ) {
    return (
      1 /
      (
        1 +
        Math.exp(
          -0.9 *
          (
            theta -
            difficulty
          )
        )
      )
    );
  }


  function learningRate(
    effectiveAttempts
  ) {
    return (
      0.15 +
      0.35 *
      Math.exp(
        -(
          Number(
            effectiveAttempts
          ) || 0
        ) / 30
      )
    );
  }


  function difficultyWeight(
    purpose
  ) {
    if (
      purpose ===
      'diagnosis'
    ) {
      return 1.2;
    }

    if (
      purpose ===
      'review'
    ) {
      return 0.6;
    }

    return 1;
  }


  function topicWeight(
    purpose
  ) {
    if (
      purpose ===
      'review'
    ) {
      return 1;
    }

    if (
      purpose ===
      'diagnosis'
    ) {
      return 0;
    }

    return 0.85;
  }


  function piecewiseMap(
    value,
    points
  ) {
    const x =
      Number(value);

    if (
      !Number.isFinite(x)
    ) {
      return value;
    }

    if (
      !Array.isArray(
        points
      ) ||
      points.length < 2
    ) {
      return x;
    }


    const sorted =
      points
        .map(
          p => ({
            provisional:
              Number(
                p.provisional
              ),

            real:
              Number(
                p.real
              )
          })
        )
        .filter(
          p =>
            Number.isFinite(
              p.provisional
            ) &&
            Number.isFinite(
              p.real
            )
        )
        .sort(
          (
            a,
            b
          ) =>
            a.provisional -
            b.provisional
        );


    if (
      sorted.length < 2
    ) {
      return x;
    }


    if (
      x <=
      sorted[0]
        .provisional
    ) {
      const a =
        sorted[0];

      const b =
        sorted[1];

      const slope =
        (
          b.real -
          a.real
        ) /
        (
          b.provisional -
          a.provisional ||
          1
        );

      return (
        a.real +
        slope *
        (
          x -
          a.provisional
        )
      );
    }


    if (
      x >=
      sorted[
        sorted.length - 1
      ]
        .provisional
    ) {
      const a =
        sorted[
          sorted.length - 2
        ];

      const b =
        sorted[
          sorted.length - 1
        ];

      const slope =
        (
          b.real -
          a.real
        ) /
        (
          b.provisional -
          a.provisional ||
          1
        );

      return (
        b.real +
        slope *
        (
          x -
          b.provisional
        )
      );
    }


    for (
      let i = 0;
      i <
      sorted.length - 1;
      i++
    ) {
      const a =
        sorted[i];

      const b =
        sorted[i + 1];

      if (
        x >=
          a.provisional &&
        x <=
          b.provisional
      ) {
        const t =
          (
            x -
            a.provisional
          ) /
          (
            b.provisional -
            a.provisional ||
            1
          );

        return (
          a.real +
          t *
          (
            b.real -
            a.real
          )
        );
      }
    }


    return x;
  }


  function calibrateDifficulty(
    provisionalDifficulty
  ) {
    const model =
      state
        .difficultyModel;


    if (
      !model.calibrated ||
      !Array.isArray(
        model
          .calibrationPoints
      ) ||
      model
        .calibrationPoints
        .length < 2
    ) {
      return clamp(
        Number(
          provisionalDifficulty
        ) || 6,
        1,
        13.5
      );
    }


    return clamp(
      piecewiseMap(
        provisionalDifficulty,
        model
          .calibrationPoints
      ),
      1,
      13.5
    );
  }


  function displayLevelLabel(
    module
  ) {
    if (
      state
        .settings
        .difficultyMode ===
      'fixed'
    ) {
      return (
        `Lv.${
          state
            .settings
            .manualLevels[
              module
            ]
        }`
      );
    }


    const ability =
      Number(
        state
          .profile
          .abilityByModule[
            module
          ]
      ) || 6;


    if (
      ability >= 12.65
    ) {
      return 'Lv.12+';
    }


    return (
      `Lv.${
        state
          .profile
          .displayLevelByModule[
            module
          ] ||
        Math.round(
          ability
        )
      }`
    );
  }


  function syncDisplayLevel(
    module,
    force = false
  ) {
    const theta =
      Number(
        state
          .profile
          .abilityByModule[
            module
          ]
      ) || 6;


    if (force) {
      state
        .profile
        .displayLevelByModule[
          module
        ] =
          clamp(
            Math.round(
              theta
            ),
            1,
            12
          );

      return;
    }


    let current =
      clamp(
        Number(
          state
            .profile
            .displayLevelByModule[
              module
            ]
        ) ||
        Math.round(
          theta
        ),
        1,
        12
      );


    while (
      current < 12 &&
      theta >=
        current + 0.65
    ) {
      current += 1;
    }


    while (
      current > 1 &&
      theta <=
        current - 0.65
    ) {
      current -= 1;
    }


    state
      .profile
      .displayLevelByModule[
        module
      ] =
        current;
  }


  function updateAbility(
    module,
    difficulty,
    correct,
    purpose = 'daily'
  ) {
    const before =
      Number(
        state
          .profile
          .abilityByModule[
            module
          ]
      ) || 6;


    if (
      state
        .settings
        .difficultyMode !==
      'adaptive'
    ) {
      return {
        before,
        after:
          before,

        probability:
          correctProbability(
            before,
            difficulty
          ),

        k: 0,
        weight: 0,
        changed:
          false
      };
    }


    const n =
      Number(
        state
          .profile
          .effectiveAttemptsByModule[
            module
          ]
      ) || 0;


    const p =
      correctProbability(
        before,
        difficulty
      );

    const k =
      learningRate(n);

    const w =
      difficultyWeight(
        purpose
      );

    const r =
      correct
        ? 1
        : 0;


    const after =
      clamp(
        before +
        k *
        (
          r - p
        ) *
        w,
        1,
        13.5
      );


    state
      .profile
      .abilityByModule[
        module
      ] =
        round2(
          after
        );


    state
      .profile
      .effectiveAttemptsByModule[
        module
      ] =
        n + w;


    const baseConfidence =
      1 -
      Math.exp(
        -(
          n + w
        ) /
        18
      );


    state
      .profile
      .confidenceByModule[
        module
      ] =
        round2(
          clamp(
            Math.max(
              state
                .profile
                .confidenceByModule[
                  module
                ] ||
              0.15,

              baseConfidence
            ),
            0.15,
            0.98
          )
        );


    syncDisplayLevel(
      module
    );


    return {
      before:
        round2(
          before
        ),

      after:
        round2(
          after
        ),

      probability:
        round2(p),

      k:
        round2(k),

      weight: w,

      changed:
        Math.abs(
          after -
          before
        ) >
        0.0001
    };
  }


  function updateTopicMastery(
    question,
    correct,
    purpose = 'daily'
  ) {
    if (
      purpose ===
      'diagnosis'
    ) {
      return null;
    }


    const key =
      topicKey(
        question
      );


    const existing =
      state
        .stats
        .byTopic[
          key
        ] ||
      {
        module:
          question.module,

        topic:
          question.topic ||
          '综合基础',

        attempts: 0,
        correct: 0,

        ability:
          Number(
            state
              .profile
              .abilityByModule[
                question.module
              ]
          ) || 6,

        confidence:
          0.15,

        lastAttemptAt:
          null
      };


    const b =
      Number(
        question
          .calibratedDifficulty ??
        question
          .provisionalDifficulty ??
        question
          .difficulty
      ) || 6;


    const before =
      Number(
        existing.ability
      ) ||
      Number(
        state
          .profile
          .abilityByModule[
            question.module
          ]
      ) ||
      6;


    const n =
      Number(
        existing.attempts
      ) || 0;


    const p =
      correctProbability(
        before,
        b
      );


    const k =
      0.18 +
      0.32 *
      Math.exp(
        -n / 18
      );


    const w =
      topicWeight(
        purpose
      );


    const r =
      correct
        ? 1
        : 0;


    const after =
      clamp(
        before +
        k *
        (
          r - p
        ) *
        w,
        1,
        13.5
      );


    existing.attempts +=
      1;


    if (correct) {
      existing.correct +=
        1;
    }


    existing.ability =
      round2(
        after
      );


    existing.confidence =
      round2(
        clamp(
          1 -
          Math.exp(
            -existing.attempts /
            12
          ),
          0.15,
          0.98
        )
      );


    existing.lastAttemptAt =
      new Date()
        .toISOString();


    state
      .stats
      .byTopic[
        key
      ] =
        existing;


    return {
      before:
        round2(
          before
        ),

      after:
        round2(
          after
        )
    };
  }


  /*
  =========================================================
  Calibration
  =========================================================
  */

  function applyCalibrationModel(
    points,
    version =
      'v1-anchor'
  ) {
    if (
      !Array.isArray(
        points
      ) ||
      points.length < 2
    ) {
      throw new Error(
        '至少需要两个 calibration points。'
      );
    }


    const cleanPoints =
      points
        .map(
          p => ({
            provisional:
              Number(
                p.provisional
              ),

            real:
              Number(
                p.real
              )
          })
        )
        .filter(
          p =>
            Number.isFinite(
              p.provisional
            ) &&
            Number.isFinite(
              p.real
            )
        )
        .sort(
          (
            a,
            b
          ) =>
            a.provisional -
            b.provisional
        );


    if (
      cleanPoints.length < 2
    ) {
      throw new Error(
        '有效 calibration points 不足。'
      );
    }


    MODULE_KEYS.forEach(
      module => {
        state
          .profile
          .abilityByModule[
            module
          ] =
            round2(
              clamp(
                piecewiseMap(
                  state
                    .profile
                    .abilityByModule[
                      module
                    ],

                  cleanPoints
                ),
                1,
                13.5
              )
            );

        syncDisplayLevel(
          module,
          true
        );
      }
    );


    state.history =
      state.history.map(
        item => ({
          ...item,

          calibratedDifficulty:
            Number.isFinite(
              Number(
                item
                  .provisionalDifficulty
              )
            )
              ? round2(
                  clamp(
                    piecewiseMap(
                      item
                        .provisionalDifficulty,

                      cleanPoints
                    ),
                    1,
                    13.5
                  )
                )
              : item
                  .calibratedDifficulty
        })
      );


    state.reviews =
      state.reviews.map(
        item => ({
          ...item,

          calibratedDifficulty:
            Number.isFinite(
              Number(
                item
                  .provisionalDifficulty
              )
            )
              ? round2(
                  clamp(
                    piecewiseMap(
                      item
                        .provisionalDifficulty,

                      cleanPoints
                    ),
                    1,
                    13.5
                  )
                )
              : item
                  .calibratedDifficulty
        })
      );


    state.difficultyModel = {
      version,
      calibrated: true,

      calibrationPoints:
        cleanPoints,

      note:
        'Calibrated with external anchor bank.'
    };


    saveState();
    renderAll();
  }


  function resetCalibrationModel() {
    state.difficultyModel =
      deepClone(
        DEFAULT_STATE
          .difficultyModel
      );

    saveState();
    renderAll();
  }


  window.CalcDailyCalibration = {
    apply:
      applyCalibrationModel,

    reset:
      resetCalibrationModel,

    exportData() {
      return {
        difficultyModel:
          deepClone(
            state
              .difficultyModel
          ),

        history:
          deepClone(
            state.history
          ),

        profile:
          deepClone(
            state.profile
          )
      };
    }
  };


  /*
  =========================================================
  Answer normalization
  =========================================================
  */

  const CHINESE_DIGITS = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };


  function chineseIntegerToNumber(
    text
  ) {
    if (!text) {
      return null;
    }


    if (
      /^[零〇一二两三四五六七八九]$/
        .test(text)
    ) {
      return (
        CHINESE_DIGITS[
          text
        ]
      );
    }


    let total = 0;
    let current = 0;
    let seen = false;


    for (
      const char
      of text
    ) {
      if (
        char in
        CHINESE_DIGITS
      ) {
        current =
          CHINESE_DIGITS[
            char
          ];

        seen = true;

        continue;
      }


      if (
        char === '十'
      ) {
        seen = true;

        total +=
          (
            current ||
            1
          ) * 10;

        current = 0;

        continue;
      }


      if (
        char === '百'
      ) {
        seen = true;

        total +=
          (
            current ||
            1
          ) * 100;

        current = 0;

        continue;
      }


      return null;
    }


    return seen
      ? total + current
      : null;
  }


  function replaceChineseFractions(
    input
  ) {
    let s =
      String(input);


    s =
      s.replace(
        /([零〇一二两三四五六七八九十百]+)分之([零〇一二两三四五六七八九十百]+)/g,

        (
          match,
          denominatorText,
          numeratorText
        ) => {
          const denominator =
            chineseIntegerToNumber(
              denominatorText
            );

          const numerator =
            chineseIntegerToNumber(
              numeratorText
            );


          if (
            denominator ===
              null ||
            numerator ===
              null ||
            denominator ===
              0
          ) {
            return match;
          }


          return (
            `${numerator}/` +
            `${denominator}`
          );
        }
      );


    return s.replace(
      /一半/g,
      '1/2'
    );
  }


  function convertLatexFractions(
    input
  ) {
    let s =
      input;


    for (
      let i = 0;
      i < 4;
      i++
    ) {
      const before =
        s;


      s =
        s.replace(
          /\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
          '($1)/($2)'
        );


      if (
        before === s
      ) {
        break;
      }
    }


    return s;
  }


  function normalizeAnswer(
    value = ''
  ) {
    let s =
      String(value)
        .toLowerCase();


    s =
      s.replace(
        /[\u00A0\u1680\u180E\u2000-\u200D\u202F\u205F\u2060\u3000\uFEFF]/g,
        ''
      );


    s =
      s
        .replace(
          /（/g,
          '('
        )
        .replace(
          /）/g,
          ')'
        )
        .replace(
          /＋/g,
          '+'
        )
        .replace(
          /[－−–—]/g,
          '-'
        )
        .replace(
          /×/g,
          '*'
        )
        .replace(
          /[÷／]/g,
          '/'
        )
        .replace(
          /，/g,
          ','
        )
        .replace(
          /。/g,
          ''
        )
        .replace(
          /²/g,
          '^2'
        )
        .replace(
          /³/g,
          '^3'
        )
        .replace(
          /½/g,
          '1/2'
        )
        .replace(
          /⅓/g,
          '1/3'
        )
        .replace(
          /⅔/g,
          '2/3'
        )
        .replace(
          /¼/g,
          '1/4'
        )
        .replace(
          /¾/g,
          '3/4'
        );


    s =
      replaceChineseFractions(
        s
      );


    s =
      s
        .replace(
          /\\left/g,
          ''
        )
        .replace(
          /\\right/g,
          ''
        )
        .replace(
          /\\,/g,
          ''
        )
        .replace(
          /\\!/g,
          ''
        )
        .replace(
          /\\;/g,
          ''
        )
        .replace(
          /\\:/g,
          ''
        )
        .replace(
          /\\cdot/g,
          '*'
        )
        .replace(
          /\\times/g,
          '*'
        );


    s =
      convertLatexFractions(
        s
      );


    s =
      s
        .replace(
          /\\sqrt\s*\{([^{}]+)\}/g,
          'sqrt($1)'
        )
        .replace(
          /\\ln/g,
          'ln'
        )
        .replace(
          /\\log/g,
          'log'
        )
        .replace(
          /\\sin/g,
          'sin'
        )
        .replace(
          /\\cos/g,
          'cos'
        )
        .replace(
          /\\tan/g,
          'tan'
        )
        .replace(
          /\s+/g,
          ''
        )
        .replace(
          /[{}]/g,
          ''
        );


    return s;
  }


  function parseSimpleNumericAnswer(
    value
  ) {
    const s =
      normalizeAnswer(
        value
      );


    if (
      /^-?\d+(\.\d+)?%$/
        .test(s)
    ) {
      return (
        Number(
          s.slice(
            0,
            -1
          )
        ) /
        100
      );
    }


    if (
      /^-?\d+(\.\d+)?$/
        .test(s)
    ) {
      return Number(s);
    }


    const fraction =
      s.match(
        /^\(?(-?\d+(?:\.\d+)?)\)?\/\(?(-?\d+(?:\.\d+)?)\)?$/
      );


    if (fraction) {
      const denominator =
        Number(
          fraction[2]
        );


      if (
        denominator !== 0
      ) {
        return (
          Number(
            fraction[1]
          ) /
          denominator
        );
      }
    }


    return null;
  }


  function stripIntegrationConstant(
    value
  ) {
    return normalizeAnswer(
      value
    )
      .replace(
        /\+c$/i,
        ''
      )
      .replace(
        /-c$/i,
        ''
      );
  }


  function locallyEquivalent(
    a,
    b
  ) {
    const na =
      normalizeAnswer(a);

    const nb =
      normalizeAnswer(b);


    if (
      na === nb
    ) {
      return true;
    }


    const va =
      parseSimpleNumericAnswer(
        a
      );

    const vb =
      parseSimpleNumericAnswer(
        b
      );


    if (
      va !== null &&
      vb !== null &&
      Math.abs(
        va - vb
      ) <
      1e-10
    ) {
      return true;
    }


    if (
      stripIntegrationConstant(
        a
      ) ===
      stripIntegrationConstant(
        b
      )
    ) {
      return true;
    }


    return false;
  }


  /* 备用题的可信来源只有一处：Verified Fallback Bank。
     先按 bankId 精确命中，再退回按题面比对。
     注意这里不要求 source 一定是 'fallback'：复习队列里的历史条目可能没带
     source/bankId（甚至没有 verification，因为备用题本身就不带快照）。
     只要题面与题库逐字段一致，它就是同一道验证过的题，不该被判成不可信。 */
  function trustedQuestion(q) {
    if (!q) return false;

    if (!FALLBACK_BANK.length) {
      return q.source === 'fallback' ? false : MathQuality.approved(q);
    }

    const byId =
      q.bankId &&
      FALLBACK_BANK.some(b => b.id === q.bankId);

    if (byId) return true;

    if (q.source === 'fallback' || !q.verification) {
      const wanted = MathQuality.content(q);
      if (FALLBACK_BANK.some(b => MathQuality.content(b) === wanted)) return true;
    }

    return MathQuality.approved(q);
  }


  /* ── Task 5D：Canonical Package 冻结 ──────────────────────────
     题目一进会话就记下身份指纹。之后不管是判题、预取、复习队列还是渲染，
     只要有人改动了七个 canonical 字段里的任何一个，指纹就对不上 ——
     这时**不能再拿这道题去判用户的答案**：题目已经不知道自己是谁，
     判出来的「对/错」没有任何依据。

     注意指纹只覆盖身份（题面 + 标准答案 + 来源 + 验证版本），
     不覆盖难度：难度是标定量，会随作答重算，改了它不算题目变了。 */
  function freezeQuestion(
    question
  ) {
    if (!question || typeof question !== 'object') {
      return question;
    }

    if (typeof MathQuality.freezeCanonical !== 'function') {
      return question;
    }

    return MathQuality.freezeCanonical(
      question
    );
  }


  function canonicalIntegrityOf(
    question
  ) {
    if (
      typeof MathQuality.canonicalIntegrity ===
      'function'
    ) {
      return MathQuality.canonicalIntegrity(
        question
      );
    }

    return { ok: true, recorded: null, actual: null, reason: 'unsupported' };
  }


  function reportQuestionIssue(q, userAnswer = '', judgeResult = null) {
    const report = {at: new Date().toISOString(), question_id: q.question_id || q.id,
      question: {module:q.module, topic:q.topic, instruction:q.instruction, expression:q.expression, prompt:q.prompt},
      canonical_answer:q.answer, solution:q.solution, user_answer:userAnswer,
      judge_result:judgeResult, verification_result:q.verification || null};
    try {
      const key='calcDaily.questionIssues.v1';
      const reports=JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key,JSON.stringify([...reports.slice(-99),report]));
    } catch(error) { console.warn('Question issue storage unavailable',error); }
    window.dispatchEvent(new CustomEvent('calcdaily:question-issue',{detail:report}));
  }

  function voidQuestion(session,q,containerId,userAnswer='',verdict=null) {
    reportQuestionIssue(q,userAnswer,verdict);
    q.status='void';
    const container=$(containerId);

    // 「标准答案有问题」和「题目本身不可信」要分开措辞：
    // 前者不是学生的错，混在一起说会让人以为自己答错了。
    const message =
      verdict?.reason === MathQuality.JUDGE_REASONS.CANONICAL_SUSPECTED
        ? '这道题的标准答案存在问题，已自动作废。这不是你的错，本题不会影响你的学习记录。'
        : '这道题存在异常，已自动作废。本题不会影响你的学习记录。';

    container.innerHTML='<div class="question-card rounded-2xl bg-white p-6"><p>'+message+'</p><button id="retryQualityBtn" class="mt-4">重新生成 / 继续</button></div>';
    $('retryQualityBtn').addEventListener('click',()=>{
      session.currentQuestion=null;
      saveState();
      ensureCurrentQuestion(session);
    },{once:true});
  }

  /* 判题服务连不上 ≠ 题目有问题。
     这两件事以前是同一个 trusted:false，界面于是把网络故障也说成
     「这道题存在异常，已自动作废」：题本身是对的，用户却被告知题有问题，
     而且这一次作答直接没了、练习卡在原地。
     现在网络/协议类失败一律保留题目和已经写下的答案，只提示网络问题并允许重试。

     judge_uncertain 在这一版里多了一层含义：确定性引擎、结构检查都给不出结论，
     而模型说的又是「等价」（Task #4 起模型不能单独判对）—— 也就是「机器暂时
     判不了」。它不是失败，是能力边界：文案必须这么说，且不计入学习数据
     （调用方在 trusted!==true 时直接 return，不会写能力/主题/复习队列）。 */
  function judgeUnavailable(verdict,userAnswer) {
    const button = $('submitAnswerBtn');
    if (button) { button.disabled = false; button.textContent = '重试提交'; }

    // 用户写的答案不能因为一次网络抖动就丢掉。
    const input = $('answerInput');
    if (input && userAnswer) input.value = userAnswer;

    toast(
      verdict?.reason === 'judge_uncertain'
        ? '暂时无法可靠判断这个答案。这一次不计入统计，题目本身没有问题，可以再提交一次。'
        : '连不上判题服务（网络问题，不是题目问题）。你的答案已保留，请重试。'
    );
  }

  /* 判题失败的三种情况必须分开处理：
       question_untrusted  题目本身不可信      → 作废这道题，换一题
       judge_unavailable   判题服务连不上      → 保留题目，让用户重试
       judge_uncertain     判题返回了但不可用  → 保留题目，让用户重试
     把它们压成一个 trusted:false，上层就只能一刀切。 */
  async function judgeAnswer(question,userAnswer,meta={}) {
    /* Task 5D：先核对题目身份。trustedQuestion 对备用题是按 bankId 命中的，
       只要 id 存在就放行 —— 一道备用题的答案被就地改写，它会照样"可信"，
       然后拿着被改过的答案去判用户的卷子。这道闸必须单独守。 */
    const integrity = canonicalIntegrityOf(question);

    if (!integrity.ok) {
      reportQuestionIssue(question, userAnswer, {reason:'canonical_mutated'});
      diagJudgeOutcome(question, {trusted:false, reason:MathQuality.JUDGE_REASONS.QUESTION_UNTRUSTED}, {
        kind: FAILURE_KINDS.CANONICAL_MUTATED,
        session_id: meta.session_id ?? null,
        question_sequence: meta.question_sequence ?? null,
        message: '题目身份指纹对不上，已停手'
      });
      return {correct:null,trusted:false,reason:MathQuality.JUDGE_REASONS.QUESTION_UNTRUSTED,
        canonical:{recorded:integrity.recorded,actual:integrity.actual}};
    }

    if(!trustedQuestion(question)) {
      diagJudgeOutcome(question, {trusted:false, reason:MathQuality.JUDGE_REASONS.QUESTION_UNTRUSTED}, {
        session_id: meta.session_id ?? null,
        question_sequence: meta.question_sequence ?? null,
        message: '题目未通过可信性检查'
      });
      return {correct:null,trusted:false,reason:MathQuality.JUDGE_REASONS.QUESTION_UNTRUSTED};
    }

    // 本地引擎也要走完整两层：先标量比较，再结构检查。
    // 只比标量的话，表达式形态的答案（比如参考答案外面套了个系数）一路漏到
    // 服务端模型那里，而模型对这种形态是会对错判的 —— 这条泄漏在浏览器里就
    // 存在，不是服务端独有。
    // 带一次回退：静态站的前端和引擎是两个文件，万一浏览器缓存了新 app.js
    // 配旧 math-quality.js，至少退回旧行为，而不是整个判题报错。
    const decision = MathQuality.judgeDeterministic
      ? MathQuality.judgeDeterministic(question,userAnswer)
      : {verdict:MathQuality.compare(userAnswer,question.answer),layer:'scalar'};

    if(decision.verdict!=='uncertain') {
      const local={correct:decision.verdict==='equivalent',verdict:decision.verdict,trusted:true,method:'deterministic',
        judge_layer:decision.layer,
        feedback:decision.verdict==='equivalent'?'与参考答案数学等价。':'与参考答案不等价。'};

      diagJudgeOutcome(question, local, {
        session_id: meta.session_id ?? null,
        question_sequence: meta.question_sequence ?? null,
        message: `deterministic:${decision.layer}`
      });

      return local;
    }

    try {
      const result=await apiCall('judge',{question,userAnswer,
        request_id: nextRequestId('judge'),
        session_id: meta.session_id ?? null,
        question_sequence: meta.question_sequence ?? null});

      /* Task 5I：逐次校验服务端版本，而不是靠启动时那一次 health。
         请求发出到返回之间，后端可能已经灰度到另一版；一个「握手时对得上、
         返回时对不上」的响应不能被当成可信结论，尤其不能被当成「答对了」。

         版本对不上时不判对也不判错 —— 归到 judge_uncertain，
         保留题目与答案让用户重试。宁可多按一次提交，也不要给错结论。 */
      const protocol =
        checkResponseProtocol(result);

      if(!protocol.ok && result?.verdict==='equivalent') {
        markApiRequestSuccess();

        diagJudgeOutcome(question, {trusted:false, reason:MathQuality.JUDGE_REASONS.JUDGE_UNCERTAIN}, {
          kind: FAILURE_KINDS.PROTOCOL_MISMATCH,
          session_id: meta.session_id ?? null,
          question_sequence: meta.question_sequence ?? null,
          message: `引擎版本不一致（本机 ${MathQuality.VERSION} / 服务端 ${protocol.actual ?? '未知'}）`
        });

        return {correct:null,trusted:false,reason:MathQuality.JUDGE_REASONS.JUDGE_UNCERTAIN,verdict:result.verdict,
          protocol_mismatch:true,versions:protocol};
      }

      if(result.trusted===true && ['equivalent','not_equivalent'].includes(result.verdict)) {
        // 模型不能单独把答案判「对」。只有确定性引擎（含结构检查）给出的
        // equivalent 才算数；服务端要是越权返回了 method:'ai' 的对判，这里拦掉。
        // 这是「错答放行率 = 0」在客户端的最后一道闸 —— 服务端已按同一规则收紧，
        // 但两处都守住，才不会因为一次服务端改动就悄悄漏回去。
        if(result.verdict==='equivalent' && result.method!=='deterministic') {
          markApiRequestSuccess();

          const rejected={correct:null,trusted:false,reason:MathQuality.JUDGE_REASONS.JUDGE_UNCERTAIN,verdict:result.verdict};

          diagJudgeOutcome(question, rejected, {
            kind: FAILURE_KINDS.JUDGE_UNCERTAIN,
            session_id: meta.session_id ?? null,
            question_sequence: meta.question_sequence ?? null,
            message: `模型越权对判 method=${result.method ?? 'unknown'}`
          });

          return rejected;
        }

        markApiRequestSuccess();

        const accepted={...result,correct:result.verdict==='equivalent'};

        diagJudgeOutcome(question, accepted, {
          kind: null,
          session_id: meta.session_id ?? null,
          question_sequence: meta.question_sequence ?? null,
          message: `${result.method ?? 'server'}:${result.judge_layer ?? result.layer ?? 'unknown'}`
        });

        return accepted;
      }

      // 判题员怀疑题目给定的标准答案本身有问题。作废这道题，但这不是学生的错。
      if(result.verdict==='canonical_suspected') {
        markApiRequestSuccess();

        const suspected={correct:null,trusted:false,reason:MathQuality.JUDGE_REASONS.CANONICAL_SUSPECTED,verdict:result.verdict};

        diagJudgeOutcome(question, suspected, {
          kind: FAILURE_KINDS.CANONICAL_MUTATED,
          session_id: meta.session_id ?? null,
          question_sequence: meta.question_sequence ?? null,
          message: '服务端怀疑标准答案本身有问题'
        });

        return suspected;
      }

      // 服务端已经区分了「题目不可信」和「判题服务不可用」，照搬它的原因，
      // 不要在这里重新猜一遍——猜错就会把网络故障说成题目有问题。
      // 注意必须逐条映射：只认 question_untrusted、其余一律归到 judge_uncertain 的话，
      // 真正的 judge_unavailable 会被降级，界面于是把「连不上服务」说成「判题没结论」。
      const SERVER_REASONS = {
        [MathQuality.JUDGE_REASONS.QUESTION_UNTRUSTED]: MathQuality.JUDGE_REASONS.QUESTION_UNTRUSTED,
        [MathQuality.JUDGE_REASONS.JUDGE_UNAVAILABLE]: MathQuality.JUDGE_REASONS.JUDGE_UNAVAILABLE,
        [MathQuality.JUDGE_REASONS.CANONICAL_SUSPECTED]: MathQuality.JUDGE_REASONS.CANONICAL_SUSPECTED
      };

      const reason =
        SERVER_REASONS[result.reason] ||
        MathQuality.JUDGE_REASONS.JUDGE_UNCERTAIN;

      const unresolved={correct:null,trusted:false,reason,verdict:result?.verdict};

      diagJudgeOutcome(question, unresolved, {
        session_id: meta.session_id ?? null,
        question_sequence: meta.question_sequence ?? null,
        message: `server:${reason}`
      });

      return unresolved;
    } catch(error) {
      markApiRequestFailure(error);

      const failed={correct:null,trusted:false,reason:MathQuality.JUDGE_REASONS.JUDGE_UNAVAILABLE,error};

      diagJudgeOutcome(question, failed, {
        kind: apiFailureKind('judge', error),
        session_id: meta.session_id ?? null,
        question_sequence: meta.question_sequence ?? null,
        duration_ms: error?.timeoutMs ? error.timeoutMs : null,
        http_status: error?.httpStatus ?? null,
        message: error?.message || String(error)
      });

      return failed;
    }
  }


  /*
  =========================================================
  Fallback bank
  =========================================================
  */

  /* Verified Fallback Bank（独立模块 fallback-bank.js，60 道，逐题经确定性引擎自检）。
     不再内联题目：内联版只有 12 道、选取只看难度、且其中一道答案是错的
     （ln(1+sin x) 的极限写成 -1/6，正确值是 +1/6）。安全网本身必须安全。 */
  const FALLBACK_BANK =
    (typeof FallbackBank !== 'undefined' &&
      FallbackBank &&
      Array.isArray(
        FallbackBank.BANK
      ))
      ? FallbackBank.BANK
      : [];


  const FALLBACK_SOURCE =
    (typeof FallbackBank !== 'undefined' &&
      FallbackBank &&
      FallbackBank.VERSION) ||
    'none';


  if (
    !FALLBACK_BANK
      .length
  ) {
    console.error(
      'fallback-bank.js 未加载：备用题池为空，AI 出题失败时将无题可退。'
    );
  }


  /* 把最近做过的备用题还原成 id 列表，供选题时排除。
     只在 state.history 里按题面反查，不需要给历史记录加新字段。 */
  function recentFallbackIds(
    limit = 20
  ) {
    const out = [];

    for (const item of state.history.slice(-limit)) {
      const key =
        item.expression ||
        item.prompt ||
        '';

      if (!key) continue;

      const hit = FALLBACK_BANK.find(
        q => q.expression === key
      );

      if (hit) out.push(hit.id);
    }

    return out;
  }


  /* 降级路径：模块内按难度最接近挑一道。
     只有在 FallbackBank.pick 不可用时才会走到这里。 */
  function closestFallback(
    module,
    target
  ) {
    const pool =
      FALLBACK_BANK.filter(
        q => q.module === module
      );

    const list =
      pool.length
        ? pool
        : FALLBACK_BANK;

    if (!list.length) return null;

    return list
      .slice()
      .sort(
        (a, b) =>
          Math.abs(a.difficulty - target) -
          Math.abs(b.difficulty - target)
      )[0];
  }


  function fallbackQuestion(
    plan
  ) {
    const module =
      plan.module ||
      'limit';

    const target =
      Number(
        plan
          .targetDifficulty
      ) || 6;


    const picked =
      (typeof FallbackBank !== 'undefined' &&
        FallbackBank &&
        typeof FallbackBank.pick === 'function')
        ? FallbackBank.pick({
            module,
            targetDifficulty: target,
            topic: plan.topic || null,
            recentIds: recentFallbackIds()
          })
        : null;

    const base =
      picked ||
      closestFallback(module, target);


    if (!base) {
      /* 备用题池为空是不可恢复的：宁可显式报错，也不要静默返回 undefined
         让上层拿到一道空题。 */
      throw new Error(
        'fallback bank unavailable (fallback-bank.js 未加载)'
      );
    }


    const provisionalDifficulty =
      Number(
        base.difficulty
      );


    /* Task 5D：备用题的可信来源是题库，但它的身份同样要冻结。
       否则「题库里有这个 id」就成了唯一凭据 —— 一道备用题的答案被就地改写，
       trustedQuestion 仍会按 bankId 放行，然后拿被改过的答案去判用户的卷子。 */
    return freezeQuestion({
      ...base,

      id:
        uid(
          'fallback'
        ),

      source:
        'fallback',

      bankId:
        base.id,

      requestedDifficulty:
        target,

      provisionalDifficulty,

      calibratedDifficulty:
        calibrateDifficulty(
          provisionalDifficulty
        ),

      difficultyModelVersion:
        state
          .difficultyModel
          .version,

      difficultyConfidence:
        0.35,

      difficultyDimensions: {
        recognition:
          provisionalDifficulty,

        techniqueDepth:
          provisionalDifficulty,

        calculationComplexity:
          provisionalDifficulty,

        knowledgeCoupling:
          Math.max(
            1,
            provisionalDifficulty -
            1
          )
      },

      planPurpose:
        plan.purpose ||
        'daily',

      reviewId:
        plan.reviewId ||
        null
    });
  }


  /*
  =========================================================
  Difficulty evaluation + generation
  =========================================================
  */

  async function evaluateDifficultyForQuestion(
    question,
    plan,
    waitForResult = false
  ) {
    const task =
      (async () => {
        try {
          const evaluation =
            await apiCall(
              'evaluate',
              {
                question: {
                  module:
                    question.module,

                  topic:
                    question.topic,

                  instruction:
                    question
                      .instruction,

                  expression:
                    question
                      .expression,

                  solution:
                    question
                      .solution,

                  requestedDifficulty:
                    question
                      .requestedDifficulty,

                  provisionalDifficulty:
                    question
                      .provisionalDifficulty
                },

                plan: {
                  targetDifficulty:
                    plan
                      .targetDifficulty
                }
              }
            );


          const estimated =
            clamp(
              Number(
                evaluation
                  .estimatedDifficulty
              ) ||
              question
                .provisionalDifficulty ||
              question
                .requestedDifficulty ||
              6,

              1,
              12
            );


          question
            .provisionalDifficulty =
              round2(
                estimated
              );


          question
            .calibratedDifficulty =
              round2(
                calibrateDifficulty(
                  estimated
                )
              );


          question
            .difficultyConfidence =
              clamp(
                Number(
                  evaluation
                    .confidence
                ) ||
                0.55,

                0,
                1
              );


          question
            .difficultyDimensions = {
              recognition:
                clamp(
                  Number(
                    evaluation
                      .recognition
                  ) ||
                  estimated,

                  1,
                  12
                ),

              techniqueDepth:
                clamp(
                  Number(
                    evaluation
                      .techniqueDepth
                  ) ||
                  estimated,

                  1,
                  12
                ),

              calculationComplexity:
                clamp(
                  Number(
                    evaluation
                      .calculationComplexity
                  ) ||
                  estimated,

                  1,
                  12
                ),

              knowledgeCoupling:
                clamp(
                  Number(
                    evaluation
                      .knowledgeCoupling
                  ) ||
                  Math.max(
                    1,
                    estimated -
                    1
                  ),

                  1,
                  12
                )
            };


          const activeQuestion =
            state
              .activeSession
              ?.currentQuestion;


          if (
            activeQuestion &&
            activeQuestion.status !== 'void' &&
            activeQuestion.id ===
              question.id
          ) {
            Object.assign(
              activeQuestion,
              deepClone(
                question
              )
            );


            saveState();


            const badge =
              $('difficultyBadge');


            if (badge) {
              badge.textContent =
                questionDifficultyLabel(
                  question
                );
            }
          }


          return question;

        } catch (error) {
          console.warn(
            '独立难度评估失败，保留生成器临时难度。',
            error
          );

          return question;
        }
      })();


    difficultyEvaluationTasks.set(
      question.id,
      task
    );


    task.finally(
      () => {
        setTimeout(
          () => {
            if (
              difficultyEvaluationTasks.get(
                question.id
              ) ===
              task
            ) {
              difficultyEvaluationTasks.delete(
                question.id
              );
            }
          },
          30000
        );
      }
    );


    if (
      waitForResult
    ) {
      return await task;
    }


    task.catch(
      () => {}
    );


    return question;
  }


  async function waitForDifficultyEvaluation(
    question,
    timeoutMs = 900
  ) {
    const task =
      difficultyEvaluationTasks.get(
        question?.id
      );


    if (!task) {
      return question;
    }


    let timer =
      null;


    try {
      await Promise.race([
        task,

        new Promise(
          resolve => {
            timer =
              setTimeout(
                resolve,
                timeoutMs
              );
          }
        )
      ]);

    } catch {
      // Keep provisional difficulty.

    } finally {
      if (timer) {
        clearTimeout(
          timer
        );
      }
    }


    return question;
  }


  async function generateOneQuestion(
    plan,
    meta = {}
  ) {
    const requestId =
      meta.request_id ||
      nextRequestId('generate');

    const sessionId =
      meta.session_id ??
      null;

    const sequence =
      meta.question_sequence ??
      null;

    const startedAt =
      Date.now();

    try {
      /* 已经确定后端版本不匹配时不再发请求。等满 60 秒再退回备用题，
         对用户毫无价值 —— 那道题无论如何都不会被采用（闸门会判它 stale）。 */
      if (knownProtocolMismatch()) {
        const error =
          new Error(
            apiProtocol?.message ||
            '后端版本不匹配，已改用备用题库'
          );

        error.code = 'CLIENT_PROTOCOL_ERROR';
        error.protocol = apiProtocol;

        throw error;
      }


      const data =
        await apiCall(
          'generate',
          {
            count: 1,

            plans: [
              plan
            ],

            difficultyModelVersion:
              state
                .difficultyModel
                .version,

            avoidPrompts:
              recentQuestionPrompts(
                10
              ),

            request_id:
              requestId,

            session_id:
              sessionId,

            question_sequence:
              sequence
          }
        );


      /* 服务端会把 request_id 原样回显。对不上就说明这个响应不属于这次请求
         （乱序、代理缓存、或服务端串了），宁可当失败重来，也不要把它当成
         这一次的题目 —— 那正是「题目跟位置对不上」最脏的一种成因。 */
      if (
        data.request_id &&
        data.request_id !==
          requestId
      ) {
        const error = new Error(
          `出题响应与请求不匹配（${data.request_id} ≠ ${requestId}）`
        );

        error.code = 'CLIENT_PROTOCOL_ERROR';

        throw error;
      }


      /* Task 5I：版本逐次校验，不依赖启动时那一次 health。 */
      const protocol =
        checkResponseProtocol(
          data
        );


      if (!protocol.ok) {
        const error = new Error(protocol.message);

        error.code = 'CLIENT_PROTOCOL_ERROR';
        error.protocol = protocol;

        throw error;
      }


      if (
        !Array.isArray(
          data.questions
        ) ||
        !data.questions.length
      ) {
        const error =
          new Error('AI 返回题目为空');

        error.code = 'GENERATE_EMPTY';

        throw error;
      }


      markApiRequestSuccess();


      const q =
        data.questions[0];


      /* 出题这一侧用**严格**闸门（Task 5C/5D）：UNCERTAIN 不放行。
         引擎验不了形态的题（Tier C）不该发给学生，退到已校验的备用题库。
         注意判题那一侧仍然用宽松的 approved() —— 用户正在做的题不能被
         「机器验不了」判成异常并作废。两侧的松紧不同是有意的。 */
      const acceptable =
        typeof MathQuality.gateApproved === 'function'
          ? MathQuality.gateApproved(q)
          : MathQuality.approved(q);


      if (!acceptable) {
        const decision = MathQuality.gateDecision(q);

        const error = new Error(
          decision.code === MathQuality.CODES.UNVERIFIED_SHAPE
            ? '题目形态无法独立验证，已改用备用题'
            : '题目未通过独立质量审核'
        );

        error.code = decision.code || 'GENERATION_REJECTED';
        error.state = decision.state || null;
        error.tier = decision.tier ?? null;

        throw error;
      }

      const provisionalDifficulty =
        clamp(
          Number(
            q
              .estimatedDifficulty ??
            q
              .provisionalDifficulty ??
            q
              .selfEstimatedDifficulty ??
            q
              .difficulty ??
            plan
              .targetDifficulty
          ) ||
          6,

          1,
          12
        );


      const question = {
        question_id:q.question_id, model:q.model,
        generator_prompt_version:q.generator_prompt_version, review_prompt_version:q.review_prompt_version,
        verification:q.verification, status:'approved',
        id:
          q.id ||
          uid('ai'),

        module:
          MODULE_KEYS.includes(
            q.module
          )
            ? q.module
            : plan.module,

        // ── canonical 字段：必须与服务端生成时一字不差 ──
        // 以前这里兜底成 plan.topic || '综合基础'，而 verification.content 快照
        // 算的是模型返回的原始 topic；两者一旦不等，整道题就会被判成「不可信」
        // 并显示「这道题存在异常」。canonical 一律不做兜底改写。
        topic:
          q.topic ||
          '',

        // ── display 字段：审核员认为考点/难度不贴切时的修正，只影响展示 ──
        // 它们不参与 content() 快照，所以改它们不会让题目失效。
        displayTopic:
          q.displayTopic ||
          null,

        displayDifficulty:
          Number(q.displayDifficulty) || null,

        metadataCorrection:
          q.metadataCorrection ||
          null,

        instruction:
          q.instruction ||
          '',

        expression:
          q.expression ||
          '',

        prompt:
          q.prompt ||
          '',

        answer:
          String(q.answer ?? ''),

        solution:
          q.solution ||
          '',

        keySteps:
          Array.isArray(
            q.keySteps
          )
            ? q.keySteps
            : [],

        source:
          'ai',

        requestedDifficulty:
          clamp(
            Number(
              plan
                .targetDifficulty
            ) ||
            6,

            1,
            12
          ),

        provisionalDifficulty:
          round2(
            provisionalDifficulty
          ),

        calibratedDifficulty:
          round2(
            calibrateDifficulty(
              provisionalDifficulty
            )
          ),

        difficultyModelVersion:
          state
            .difficultyModel
            .version,

        difficultyConfidence:
          clamp(
            Number(
              q
                .difficultyConfidence
            ) ||
            0.4,

            0,
            1
          ),

        difficultyDimensions:
          q
            .difficultyDimensions ||
          {},

        planPurpose:
          plan.purpose ||
          'daily',

        reviewId:
          plan.reviewId ||
          null
      };


      /* Task 5D：题目进会话之前就把身份钉住。放在这里而不是交给各个调用方，
         是因为这是唯一一处「题目刚刚成形」的地方 —— 之后无论谁拿着它去渲染、
         预取还是判题，指纹都已经是基准值。 */
      freezeQuestion(
        question
      );


      diagLog({
        level: 'info',
        action: 'generate',
        event: 'question_ready',
        message: 'ai',
        question_id: question.question_id || question.id || null,
        module: question.module || null,
        tier: q.tier ?? null,
        verification_state: q.verification_state ?? null,
        source: 'ai',
        request_id: requestId,
        session_id: sessionId,
        question_sequence: sequence,
        duration_ms: Date.now() - startedAt,
        outcome: 'ok',
        fallback: false
      });


      if (
        plan.purpose ===
        'diagnosis'
      ) {
        evaluateDifficultyForQuestion(
          question,
          plan,
          false
        );
      }


      return question;

    } catch (error) {
      console.warn(
        error
      );


      markApiRequestFailure(
        error
      );


      /* 失败分类：同一条「出题失败」在日志里必须能分辨是超时、网络、
         协议不匹配、还是题目被闸门拒了 —— 这四件事的处置完全不同。 */
      const kind =
        error?.code === 'CLIENT_PROTOCOL_ERROR'
          ? FAILURE_KINDS.GENERATE_PROTOCOL
          : error?.code === 'GENERATE_EMPTY'
            ? FAILURE_KINDS.GENERATE_EMPTY
            : error?.code === MathQuality.CODES.UNVERIFIED_SHAPE
              ? FAILURE_KINDS.GENERATE_UNVERIFIED
              : error?.code
                ? FAILURE_KINDS.GENERATE_REJECTED
                : apiFailureKind('generate', error);

      diagLog({
        level: 'error',
        action: 'generate',
        event: 'question_failed',
        kind,
        message: error?.message || String(error),
        module: plan?.module || null,
        request_id: requestId,
        session_id: sessionId,
        question_sequence: sequence,
        duration_ms: Date.now() - startedAt,
        http_status: error?.httpStatus ?? null,
        outcome: 'fallback',
        fallback: true
      });


      toast(
        `AI 本次出题失败，已使用备用题：${shortApiError(error)}`
      );


      const fallback =
        fallbackQuestion(
          plan
        );


      diagLog({
        level: 'info',
        action: 'generate',
        event: 'question_ready',
        kind: FAILURE_KINDS.FALLBACK_USED,
        message: 'fallback',
        question_id: fallback?.question_id || fallback?.id || null,
        module: fallback?.module || null,
        source: 'fallback',
        request_id: requestId,
        session_id: sessionId,
        question_sequence: sequence,
        duration_ms: Date.now() - startedAt,
        outcome: 'ok',
        fallback: true
      });


      return fallback;
    }
  }


  function recentQuestionPrompts(
    limit = 10
  ) {
    return state
      .history
      .slice(
        -limit
      )
      .map(
        item =>
          item.prompt ||
          item.expression ||
          ''
      )
      .filter(
        Boolean
      );
  }


  /*
  =========================================================
  Prefetch
  =========================================================
  */

  function generationFingerprint(
    mode
  ) {
    return JSON.stringify({
      mode,

      difficultyMode:
        state
          .settings
          .difficultyMode,

      manualLevels:
        state
          .settings
          .manualLevels,

      trainingMode:
        state
          .settings
          .trainingMode,

      dailyCount:
        state
          .settings
          .dailyCount,

      abilityByModule:
        state
          .profile
          .abilityByModule,

      displayLevelByModule:
        state
          .profile
          .displayLevelByModule,

      dueReviewIds:
        dueReviews()
          .slice(
            0,
            3
          )
          .map(
            item =>
              item.id
          )
    });
  }


  function previewPlanForSession(
    session
  ) {
    if (
      !session ||
      session.completed
    ) {
      return null;
    }


    const shadow =
      deepClone(
        session
      );


    if (
      shadow.mode ===
      'daily'
    ) {
      if (
        shadow
          .results
          .length >=
        shadow.total
      ) {
        return null;
      }

      return makeDailyPlan(
        shadow
      );
    }


    if (
      shadow.mode ===
      'diagnosis'
    ) {
      return diagnosisPlan(
        shadow
      );
    }


    return null;
  }


  function applyPlanSideEffects(
    session,
    plan
  ) {
    if (
      !session ||
      !plan
    ) {
      return;
    }


    if (
      plan.reviewId
    ) {
      session.usedReviewIds =
        session.usedReviewIds ||
        [];


      if (
        !session
          .usedReviewIds
          .includes(
            plan.reviewId
          )
      ) {
        session
          .usedReviewIds
          .push(
            plan.reviewId
          );
      }
    }
  }


  function scheduleSessionPrefetch(
    session
  ) {
    if (
      !session ||
      session.completed ||
      ![
        'daily',
        'diagnosis'
      ].includes(
        session.mode
      ) ||
      (
        session
          .currentQuestion ===
          null &&
        session
          .results
          .length ===
          0
      )
    ) {
      return;
    }


    const plan =
      previewPlanForSession(
        session
      );


    if (!plan) {
      return;
    }


    const key =
      session.id;

    const sequence =
      session
        .results
        .length;


    const signature =
      `${sequence}:` +
      JSON.stringify(
        plan
      );


    const existing =
      sessionPrefetch.get(
        key
      );


    if (
      existing?.signature ===
      signature
    ) {
      return;
    }


    const entry = {
      request_id:
        nextRequestId('prefetch'),

      session_id:
        key,

      question_sequence:
        sequence,

      signature,

      resultCount:
        sequence,

      plan,

      issued:
        ++prefetchIssued,

      startedAt:
        Date.now(),

      promise: null
    };


    /* 旧请求不许顶掉新请求。这一条挡的是「预取 A 先发、预取 B 后发，
       但 A 的写入晚于 B」——不挡的话，用户在 B 的位置上会拿到 A 生成的题。 */
    if (
      !prefetchSupersedes(
        entry,
        existing
      )
    ) {
      discardPrefetch(
        entry,
        'superseded_by_newer_prefetch'
      );

      return;
    }


    if (existing) {
      discardPrefetch(
        existing,
        'superseded_by_newer_prefetch'
      );
    }


    entry.promise =
      generateOneQuestion(
        plan,
        {
          request_id:
            entry.request_id,

          session_id:
            key,

          question_sequence:
            sequence
        }
      )
        .then(
          question => ({
            question,
            plan,
            request_id:
              entry.request_id,
            session_id:
              key,
            question_sequence:
              sequence
          })
        )
        .catch(
          error => {
            console.warn(
              '下一题预取失败，将在点击下一题时重试。',
              error
            );

            return null;
          }
        );


    sessionPrefetch.set(
      key,
      entry
    );
  }


  function scheduleSpeculativePrefetch(
    session,
    question
  ) {
    if (
      !session ||
      session.completed ||
      session.mode !==
        'daily' ||
      !question ||
      session
        .results
        .length +
        1 >=
        session.total
    ) {
      return;
    }


    const shadow =
      deepClone(
        session
      );


    const theta =
      Number(
        state
          .profile
          .abilityByModule[
            question.module
          ]
      ) || 6;


    const b =
      Number(
        question
          .calibratedDifficulty ??
        question
          .provisionalDifficulty ??
        question
          .requestedDifficulty
      ) || 6;


    const predictedCorrect =
      correctProbability(
        theta,
        b
      ) >=
      0.5;


    shadow.results.push({
      module:
        question.module,

      topic:
        question.topic,

      correct:
        predictedCorrect,

      zone:
        question.zone ||
        question.planPurpose,

      speculative:
        true
    });


    const plan =
      makeDailyPlan(
        shadow
      );


    if (!plan) {
      return;
    }


    /* 这一份预取对应的是「用户答完当前这道题之后」的位置，
       所以题号是 shadow 的长度（= 当前 results.length + 1）。 */
    const sequence =
      shadow
        .results
        .length;


    const signature =
      `${sequence}:` +
      JSON.stringify(
        plan
      );


    const existing =
      sessionPrefetch.get(
        session.id
      );


    if (
      existing?.signature ===
      signature
    ) {
      return;
    }


    const entry = {
      request_id:
        nextRequestId('speculative'),

      session_id:
        session.id,

      question_sequence:
        sequence,

      signature,

      resultCount:
        sequence,

      plan,

      issued:
        ++prefetchIssued,

      startedAt:
        Date.now(),

      speculative:
        true,

      promise: null
    };


    if (
      !prefetchSupersedes(
        entry,
        existing
      )
    ) {
      discardPrefetch(
        entry,
        'superseded_by_newer_prefetch'
      );

      return;
    }


    if (existing) {
      discardPrefetch(
        existing,
        'superseded_by_newer_prefetch'
      );
    }


    entry.promise =
      generateOneQuestion(
        plan,
        {
          request_id:
            entry.request_id,

          session_id:
            session.id,

          question_sequence:
            sequence
        }
      )
        .then(
          nextQuestion => ({
            question:
              nextQuestion,

            plan,

            request_id:
              entry.request_id,

            session_id:
              session.id,

            question_sequence:
              sequence
          })
        )
        .catch(
          error => {
            console.warn(
              '作答期间的下一题预取失败。',
              error
            );

            return null;
          }
        );


    sessionPrefetch.set(
      session.id,
      entry
    );
  }


  function plansCompatible(
    prefetchedPlan,
    expectedPlan
  ) {
    if (
      !prefetchedPlan ||
      !expectedPlan
    ) {
      return false;
    }


    if (
      prefetchedPlan.module !==
      expectedPlan.module
    ) {
      return false;
    }


    if (
      (
        prefetchedPlan
          .purpose ||
        'daily'
      ) !==
      (
        expectedPlan
          .purpose ||
        'daily'
      )
    ) {
      return false;
    }


    if (
      (
        prefetchedPlan
          .reviewId ||
        null
      ) !==
      (
        expectedPlan
          .reviewId ||
        null
      )
    ) {
      return false;
    }


    const a =
      Number(
        prefetchedPlan
          .targetDifficulty
      ) || 6;

    const b =
      Number(
        expectedPlan
          .targetDifficulty
      ) || 6;


    return (
      Math.abs(
        a - b
      ) <=
      0.75
    );
  }


  async function consumeSessionPrefetch(
    session,
    expectedPlan =
      null
  ) {
    const key =
      session?.id;

    const cached =
      sessionPrefetch.get(
        key
      );


    if (!cached) {
      return null;
    }


    /* 只删除「我要取的那一条」。如果这中间已经有更新的请求写进来了，
       删掉它等于把用户本来能马上拿到的新题也一起扔了。 */
    if (
      sessionPrefetch.get(
        key
      )?.request_id ===
      cached.request_id
    ) {
      sessionPrefetch.delete(
        key
      );
    }


    if (
      cached.session_id !==
      key
    ) {
      return discardPrefetch(
        cached,
        'session_mismatch'
      );
    }


    if (
      cached.resultCount !==
      session
        .results
        .length ||
      cached.question_sequence !==
      session
        .results
        .length
    ) {
      return discardPrefetch(
        cached,
        'sequence_advanced_before_wait'
      );
    }


    if (session.completed) {
      return discardPrefetch(
        cached,
        'session_completed_before_wait'
      );
    }


    const value =
      await cached.promise;


    /* ★ 最重要的一次核对：await 之前题目对得上，不代表 await 之后还对得上。
       模型返回要 10~40 秒，用户在这段时间里完全可能已经交卷、切模块、结束会话。
       只在 await 之前检查，等于假装这段时间不存在 —— 这正是「下一题跳回
       上一题的题面」「答完题又被塞了一道新题」这类现象的来源。 */
    const nowCurrent =
      sessionPrefetch.get(
        key
      );


    if (
      nowCurrent &&
      nowCurrent.request_id !==
        cached.request_id
    ) {
      return discardPrefetch(
        cached,
        'superseded_during_wait'
      );
    }


    if (
      session
        .results
        .length !==
      cached.question_sequence
    ) {
      return discardPrefetch(
        cached,
        'sequence_changed_during_wait'
      );
    }


    if (session.completed) {
      return discardPrefetch(
        cached,
        'session_completed_during_wait'
      );
    }


    if (
      !value?.question
    ) {
      return null;
    }


    if (
      value.request_id &&
      value.request_id !==
        cached.request_id
    ) {
      return discardPrefetch(
        cached,
        'response_request_id_mismatch'
      );
    }


    if (
      expectedPlan &&
      !plansCompatible(
        value.plan,
        expectedPlan
      )
    ) {
      return discardPrefetch(
        cached,
        'plan_mismatch'
      );
    }


    applyPlanSideEffects(
      session,
      value.plan
    );


    value.question.zone =
      value.plan.zone ||
      value.plan.purpose;


    return value.question;
  }


  function warmupPlan(
    mode
  ) {
    if (
      mode ===
      'daily'
    ) {
      const shadow =
        createDailySession();

      return makeDailyPlan(
        shadow
      );
    }


    if (
      mode ===
      'diagnosis'
    ) {
      const shadow =
        createDiagnosisSession();

      return diagnosisPlan(
        shadow
      );
    }


    return null;
  }


  function prefetchWarmup(
    mode
  ) {
    if (
      ![
        'daily',
        'diagnosis'
      ].includes(
        mode
      )
    ) {
      return;
    }


    if (
      state.activeSession &&
      !state
        .activeSession
        .completed
    ) {
      return;
    }


    const fingerprint =
      generationFingerprint(
        mode
      );


    const current =
      warmupPrefetch[
        mode
      ];


    if (
      current?.fingerprint ===
      fingerprint
    ) {
      return;
    }


    const plan =
      warmupPlan(
        mode
      );


    if (!plan) {
      return;
    }


    const requestId =
      nextRequestId(
        'warmup'
      );


    warmupPrefetch[
      mode
    ] = {
      fingerprint,
      plan,

      request_id:
        requestId,

      session_id:
        null,

      question_sequence:
        0,

      startedAt:
        Date.now(),

      promise:
        generateOneQuestion(
          plan,
          {
            request_id:
              requestId,

            session_id:
              null,

            question_sequence:
              0
          }
        )
          .then(
            question => ({
              question,
              plan,
              request_id:
                requestId
            })
          )
          .catch(
            error => {
              console.warn(
                `${mode} 第一题预热失败，将在开始时重试。`,
                error
              );

              return null;
            }
          )
    };
  }


  async function consumeWarmup(
    mode,
    session
  ) {
    const cached =
      warmupPrefetch[
        mode
      ];


    warmupPrefetch[
      mode
    ] =
      null;


    if (!cached) {
      return null;
    }


    if (
      cached.fingerprint !==
      generationFingerprint(
        mode
      )
    ) {
      return null;
    }


    const value =
      await cached.promise;


    if (
      !value?.question
    ) {
      return null;
    }


    /* Task 5E：预热是「还没开始做题时提前生成第一题」，所以只允许落在
       一道**还是空的**会话上。await 期间用户可能已经手快开始了这一组、
       或者已经结束了它 —— 这时把这份预热套上去，等于凭空往一个已经
       有进度的会话里插一道第一题。 */
    if (
      !session ||
      session.completed
    ) {
      return discardPrefetch(
        cached,
        'warmup_session_gone'
      );
    }


    if (
      session
        .currentQuestion !==
        null ||
      session
        .results
        .length !==
        0
    ) {
      return discardPrefetch(
        cached,
        'warmup_session_no_longer_empty'
      );
    }


    applyPlanSideEffects(
      session,
      value.plan
    );


    value.question.zone =
      value.plan.zone ||
      value.plan.purpose;


    return value.question;
  }


  /*
  =========================================================
  Stats + review queue
  =========================================================
  */

  function recordPracticeStats(
    question,
    correct
  ) {
    state
      .stats
      .attempts +=
        1;


    if (correct) {
      state
        .stats
        .correct +=
          1;
    }


    const moduleStat =
      state
        .stats
        .byModule[
          question.module
        ];


    moduleStat.attempts +=
      1;


    if (correct) {
      moduleStat.correct +=
        1;
    }
  }


  function recordHistory({
    question,
    userAnswer,
    correct,
    purpose,
    abilityResult = null,
    topicResult = null,
    needsManualCheck = false
  }) {
    const record = {
      question_id:question.question_id || question.id, model:question.model,
      generator_prompt_version:question.generator_prompt_version, review_prompt_version:question.review_prompt_version,
      verification:question.verification, solution:question.solution,
      id:
        uid(
          'attempt'
        ),

      questionId:
        question.id,

      module:
        question.module,

      topic:
        question.topic,

      instruction:
        question
          .instruction ||
        '',

      expression:
        question
          .expression ||
        '',

      prompt:
        question.prompt ||
        '',

      answer:
        question.answer,

      userAnswer,

      correct,

      needsManualCheck,

      purpose,

      requestedDifficulty:
        question
          .requestedDifficulty ??
        null,

      provisionalDifficulty:
        question
          .provisionalDifficulty ??
        question
          .difficulty ??
        null,

      calibratedDifficulty:
        question
          .calibratedDifficulty ??
        question
          .provisionalDifficulty ??
        question
          .difficulty ??
        null,

      difficultyModelVersion:
        question
          .difficultyModelVersion ||
        state
          .difficultyModel
          .version,

      difficultyConfidence:
        question
          .difficultyConfidence ??
        null,

      difficultyDimensions:
        question
          .difficultyDimensions ||
        null,

      abilityBefore:
        abilityResult
          ?.before ??
        null,

      abilityAfter:
        abilityResult
          ?.after ??
        null,

      predictedCorrectProbability:
        abilityResult
          ?.probability ??
        null,

      learningRate:
        abilityResult
          ?.k ??
        null,

      abilityWeight:
        abilityResult
          ?.weight ??
        null,

      topicAbilityBefore:
        topicResult
          ?.before ??
        null,

      topicAbilityAfter:
        topicResult
          ?.after ??
        null,

      at:
        new Date()
          .toISOString()
    };


    state.history.push(
      record
    );


    if (
      state.history.length >
      1200
    ) {
      state.history =
        state.history.slice(
          -1200
        );
    }


    return record;
  }


  /* 一道题和它的 verification 快照是不可分割的一对。
     快照是按 canonical 字段算出来的，字段一改，快照立刻失效。

     旧的更新分支把 instruction/expression/prompt/answer/solution 逐个覆盖过去，
     快照却留在创建时那道题上（同一考点第二次做错时会走到这里）。
     结果是存下来的复习条目自相矛盾：它持有一份描述**另一道题**的验证快照。

     目前复习会话不是把条目当题目渲染，而是拿它的题面当 referenceQuestion
     重新生成一道题，所以这条不一致还没变成可见故障。但它是持久化数据在说谎，
     会被同步到云端，而且只要将来有代码按 trustedQuestion 校验条目，就会立刻
     变成「这道题存在异常」。顺带一提，旧写法还给空 topic 补了「综合基础」——
     那等于往 canonical 字段里写一个题目本身没有的考点。

     所以这里只提供整体替换，不提供"顺手改一个字段"的入口。 */
  const CANONICAL_FIELDS = [
    'module',
    'topic',
    'instruction',
    'expression',
    'prompt',
    'answer',
    'solution'
  ];


  function bindReviewQuestion(
    item,
    question
  ) {
    for (
      const field of CANONICAL_FIELDS
    ) {
      // 逐字段对齐 MathQuality.content() 的取值方式，不多不少。
      // 这里一律不做兜底改写：兜底是显示层的事，写进 canonical 字段
      // 就等于把快照和数据改成两回事。
      item[field] =
        field ===
        'answer'
          ? String(
              question
                .answer ??
              ''
            )
          : question[field] ||
            '';
    }


    item.question_id =
      question.question_id ||
      question.id ||
      null;

    item.model =
      question.model ||
      null;

    item.generator_prompt_version =
      question
        .generator_prompt_version ||
      null;

    item.review_prompt_version =
      question
        .review_prompt_version ||
      null;

    item.verification =
      question.verification ||
      null;

    // 备用题的"可信"来自题库而不是来自快照，所以来源标记要一起搬过来，
    // 否则复习时会因为缺 verification 被判成不可信。
    item.source =
      question.source ||
      null;

    item.bankId =
      question.bankId ||
      null;


    /* Task 5D：换题面 = 换了一道题，question_id 和身份指纹必须一起换。
       指纹按**条目自己**重算，而不是把原题的指纹抄过来 —— 条目少带了任何
       一个参与指纹的字段（比如 verification.pipeline），抄过来的指纹就会
       立刻对不上，条目从此一被核对就报「被篡改」。 */
    freezeQuestion(
      item
    );
  }


  function queueWrongQuestion(
    question
  ) {
    const key =
      topicKey(
        question
      );


    let item =
      state
        .reviews
        .find(
          r =>
            r.key ===
              key &&
            r.highFreq !==
              false
        );


    if (!item) {
      item = {
        id:
          uid(
            'review'
          ),

        key,

        provisionalDifficulty:
          question
            .provisionalDifficulty ??
          question
            .difficulty ??
          6,

        calibratedDifficulty:
          question
            .calibratedDifficulty ??
          question
            .provisionalDifficulty ??
          question
            .difficulty ??
          6,

        difficultyModelVersion:
          question
            .difficultyModelVersion ||
          state
            .difficultyModel
            .version,

        wrongCount: 1,
        correctStreak: 0,

        highFreq: true,

        nextReviewAt:
          addDaysISO(
            2
          ),

        updatedAt:
          new Date()
            .toISOString()
      };


      // 题目内容与 verification 快照成对写入（见 bindReviewQuestion）。
      bindReviewQuestion(
        item,
        question
      );


      state.reviews.push(
        item
      );


      return {
        type:
          'create',

        id:
          item.id
      };
    }


    const before =
      deepClone(
        item
      );


    item.wrongCount =
      (
        item.wrongCount ||
        0
      ) + 1;


    item.correctStreak =
      0;


    item.highFreq =
      true;


    item.nextReviewAt =
      addDaysISO(
        5
      );


    item.updatedAt =
      new Date()
        .toISOString();


    // 刷新成最近这道错题。canonical 字段与 verification 快照必须整体替换 ——
    // 只换字段不换快照，存下来的条目就会持有一份描述另一道题的验证快照。
    bindReviewQuestion(
      item,
      question
    );


    item.provisionalDifficulty =
      question
        .provisionalDifficulty ??
      item
        .provisionalDifficulty;


    item.calibratedDifficulty =
      question
        .calibratedDifficulty ??
      item
        .calibratedDifficulty;


    return {
      type:
        'update',

      id:
        item.id,

      before
    };
  }


  function undoReviewMutation(
    mutation
  ) {
    if (!mutation) {
      return;
    }


    if (
      mutation.type ===
      'create'
    ) {
      state.reviews =
        state
          .reviews
          .filter(
            item =>
              item.id !==
              mutation.id
          );

      return;
    }


    if (
      mutation.type ===
        'update' &&
      mutation.before
    ) {
      const index =
        state
          .reviews
          .findIndex(
            item =>
              item.id ===
              mutation.id
          );


      if (
        index >= 0
      ) {
        state.reviews[
          index
        ] =
          deepClone(
            mutation.before
          );
      }
    }
  }


  function updateReviewItem(
    reviewId,
    correct
  ) {
    if (!reviewId) {
      return null;
    }


    const item =
      state
        .reviews
        .find(
          r =>
            r.id ===
            reviewId
        );


    if (!item) {
      return null;
    }


    const before =
      deepClone(
        item
      );


    if (correct) {
      item.correctStreak =
        (
          item.correctStreak ||
          0
        ) + 1;


      if (
        item.correctStreak >=
        3
      ) {
        item.highFreq =
          false;

        item.nextReviewAt =
          null;

      } else {
        item.nextReviewAt =
          addDaysISO(
            5
          );
      }

    } else {
      item.correctStreak =
        0;

      item.wrongCount =
        (
          item.wrongCount ||
          0
        ) + 1;

      item.highFreq =
        true;

      item.nextReviewAt =
        addDaysISO(
          5
        );
    }


    item.updatedAt =
      new Date()
        .toISOString();


    return {
      type:
        'update',

      id:
        item.id,

      before
    };
  }


  function dueReviews() {
    const today =
      todayISO();


    return state
      .reviews
      .filter(
        r =>
          r.highFreq !==
            false &&
          r.nextReviewAt &&
          r.nextReviewAt <=
            today
      )
      .sort(
        (
          a,
          b
        ) =>
          String(
            a.nextReviewAt
          ).localeCompare(
            String(
              b.nextReviewAt
            )
          )
      );
  }


  /*
  =========================================================
  Weak topics + strategy
  =========================================================
  */

  function weakTopics(
    module = null
  ) {
    const rows =
      Object
        .values(
          state
            .stats
            .byTopic
        )
        .filter(
          item =>
            !module ||
            item.module ===
              module
        )
        .filter(
          item =>
            item.attempts >=
            2
        )
        .map(
          item => ({
            ...item,

            acc:
              accuracy(
                item.correct,
                item.attempts
              )
          })
        );


    rows.sort(
      (
        a,
        b
      ) => {
        const aa =
          a.acc ??
          100;

        const bb =
          b.acc ??
          100;


        if (
          aa !== bb
        ) {
          return (
            aa - bb
          );
        }


        return (
          (
            a.ability ??
            99
          ) -
          (
            b.ability ??
            99
          )
        );
      }
    );


    return rows;
  }


  function modulePriority() {
    return MODULE_KEYS
      .map(
        module => {
          const stat =
            state
              .stats
              .byModule[
                module
              ];


          const acc =
            accuracy(
              stat.correct,
              stat.attempts
            );


          const ability =
            state
              .profile
              .abilityByModule[
                module
              ];


          return {
            module,

            score:
              (
                acc ===
                  null
                  ? 0
                  : (
                      100 -
                      acc
                    ) /
                    100
              ) *
              1.2 +
              (
                12 -
                ability
              ) /
              12
          };
        }
      )
      .sort(
        (
          a,
          b
        ) =>
          b.score -
          a.score
      )
      .map(
        item =>
          item.module
      );
  }


  function effectiveConfidence(
    module
  ) {
    const base =
      Number(
        state
          .profile
          .confidenceByModule[
            module
          ]
      ) ||
      0.15;


    const latest =
      [
        ...state.history
      ]
        .reverse()
        .find(
          item =>
            item.module ===
              module &&
            item.at &&
            !item
              .needsManualCheck
        );


    if (!latest) {
      return base;
    }


    const elapsedMs =
      Date.now() -
      new Date(
        latest.at
      ).getTime();


    const days =
      Math.max(
        0,
        elapsedMs /
        86400000
      );


    const decayed =
      base *
      Math.exp(
        -days /
        90
      );


    return round2(
      clamp(
        decayed,
        0.15,
        0.98
      )
    );
  }


  function trainingModeLabel(
    mode =
      state
        .settings
        .trainingMode
  ) {
    return {
      balanced:
        '均衡',

      foundation:
        '基础巩固',

      sprint:
        '考研冲刺',

      challenge:
        '高阶挑战'
    }[mode] ||
      '均衡';
  }


  function zoneLabel(
    zone
  ) {
    return {
      consolidate:
        '巩固',

      target:
        '主训练',

      challenge:
        '挑战',

      review:
        '复习',

      placement:
        '定位',

      diagnosis:
        '定位'
    }[zone] ||
      zone;
  }


  /*
  =========================================================
  Daily planning
  =========================================================
  */

  const DAILY_PATTERNS = {
    balanced: [
      'target',
      'consolidate',
      'target',
      'challenge',
      'target',
      'review',
      'target',
      'consolidate',
      'target',
      'challenge',
      'target',
      'challenge'
    ],

    foundation: [
      'consolidate',
      'target',
      'consolidate',
      'target',
      'review',
      'target',
      'consolidate',
      'target',
      'target',
      'consolidate',
      'target',
      'consolidate'
    ],

    sprint: [
      'target',
      'challenge',
      'target',
      'review',
      'target',
      'challenge',
      'target',
      'target',
      'challenge',
      'consolidate',
      'target',
      'challenge'
    ],

    challenge: [
      'target',
      'challenge',
      'challenge',
      'target',
      'review',
      'challenge',
      'target',
      'challenge',
      'target',
      'challenge',
      'challenge',
      'target'
    ]
  };


  function recentSessionAccuracy(
    session,
    lastN = 4
  ) {
    const judged =
      (
        session.results ||
        []
      )
        .filter(
          r =>
            typeof
              r.correct ===
            'boolean'
        )
        .slice(
          -lastN
        );


    if (
      !judged.length
    ) {
      return null;
    }


    return (
      judged.filter(
        r =>
          r.correct
      ).length /
      judged.length
    );
  }


  function chooseDailyZone(
    session
  ) {
    const mode =
      state
        .settings
        .trainingMode;


    const pattern =
      DAILY_PATTERNS[
        mode
      ] ||
      DAILY_PATTERNS
        .balanced;


    const idx =
      session
        .results
        .length;


    let zone =
      pattern[
        idx %
        pattern.length
      ];


    const recent =
      recentSessionAccuracy(
        session,
        4
      );


    if (
      recent !== null &&
      session
        .results
        .length >=
        3
    ) {
      if (
        recent >= 0.8
      ) {
        if (
          zone ===
          'target'
        ) {
          zone =
            'challenge';
        }

      } else if (
        recent <=
        0.35
      ) {
        if (
          zone ===
            'challenge' ||
          zone ===
            'target'
        ) {
          zone =
            'consolidate';
        }
      }
    }


    if (
      zone ===
      'review'
    ) {
      const available =
        dueReviews()
          .filter(
            r =>
              !(
                session
                  .usedReviewIds ||
                []
              ).includes(
                r.id
              )
          );


      if (
        !available.length
      ) {
        zone =
          'target';
      }
    }


    return zone;
  }


  function chooseModuleForDaily(
    session
  ) {
    const counts =
      Object.fromEntries(
        MODULE_KEYS.map(
          m => [
            m,
            0
          ]
        )
      );


    for (
      const r
      of (
        session.results ||
        []
      )
    ) {
      if (
        r.module in
        counts
      ) {
        counts[
          r.module
        ] +=
          1;
      }
    }


    const priority =
      modulePriority();


    return [
      ...MODULE_KEYS
    ]
      .sort(
        (
          a,
          b
        ) => {
          const countDiff =
            counts[a] -
            counts[b];


          if (
            countDiff !== 0
          ) {
            return countDiff;
          }


          return (
            priority.indexOf(
              a
            ) -
            priority.indexOf(
              b
            )
          );
        }
      )[0];
  }


  function chooseWeakTopic(
    module
  ) {
    const weak =
      weakTopics(
        module
      );


    if (
      !weak.length
    ) {
      return null;
    }


    const top =
      weak.slice(
        0,
        3
      );


    return (
      top[
        Math.floor(
          Math.random() *
          top.length
        )
      ]?.topic ||
      null
    );
  }


  function targetDifficultyFor(
    module,
    zone
  ) {
    if (
      state
        .settings
        .difficultyMode ===
      'fixed'
    ) {
      return (
        Number(
          state
            .settings
            .manualLevels[
              module
            ]
        ) ||
        6
      );
    }


    const theta =
      Number(
        state
          .profile
          .abilityByModule[
            module
          ]
      ) ||
      6;


    const confidence =
      effectiveConfidence(
        module
      );


    const offsets = {
      consolidate:
        -1,

      target:
        0,

      challenge:
        1.5,

      review:
        -0.3
    };


    const modeBias = {
      balanced:
        0,

      foundation:
        -0.25,

      sprint:
        0.25,

      challenge:
        0.5
    };


    const verificationBias =
      (
        confidence <
          0.35 &&
        zone ===
          'target'
      )
        ? -0.35
        : 0;


    return round2(
      clamp(
        theta +
        (
          offsets[zone] ||
          0
        ) +
        (
          modeBias[
            state
              .settings
              .trainingMode
          ] ||
          0
        ) +
        verificationBias,

        1,
        12
      )
    );
  }


  function makeDailyPlan(
    session
  ) {
    const zone =
      chooseDailyZone(
        session
      );


    if (
      zone ===
      'review'
    ) {
      const item =
        dueReviews()
          .find(
            r =>
              !(
                session
                  .usedReviewIds ||
                []
              )
                .includes(
                  r.id
                )
          );


      if (item) {
        session.usedReviewIds =
          session.usedReviewIds ||
          [];


        session
          .usedReviewIds
          .push(
            item.id
          );


        const target =
          state
            .settings
            .difficultyMode ===
          'fixed'
            ? state
                .settings
                .manualLevels[
                  item.module
                ]
            : clamp(
                Number(
                  item
                    .calibratedDifficulty ??
                  item
                    .provisionalDifficulty ??
                  state
                    .profile
                    .abilityByModule[
                      item.module
                    ]
                ) ||
                6,

                1,
                12
              );


        return {
          module:
            item.module,

          topic:
            item.topic,

          targetDifficulty:
            round2(
              target
            ),

          purpose:
            'review',

          zone:
            'review',

          reviewId:
            item.id,

          referenceQuestion: {
            instruction:
              item.instruction,

            expression:
              item.expression,

            prompt:
              item.prompt,

            answer:
              item.answer,

            solution:
              item.solution
          }
        };
      }
    }


    const module =
      chooseModuleForDaily(
        session
      );


    const topic =
      chooseWeakTopic(
        module
      );


    return {
      module,
      topic,

      targetDifficulty:
        targetDifficultyFor(
          module,
          zone
        ),

      purpose:
        'daily',

      zone,

      reviewId:
        null
    };
  }


  /*
  =========================================================
  Diagnosis
  =========================================================
  */

  function createDiagnosisModuleState() {
    return {
      ability: 6,
      attempts: 0,
      confidence: 0.1,
      lastDifficulty: 6,
      lastCorrect: null,
      lowCorrect: null,
      highWrong: null,
      recentAbilities: [],
      finished: false
    };
  }


  function createDiagnosisSession() {
    return {
      id:
        uid(
          'session'
        ),

      mode:
        'diagnosis',

      startedAt:
        new Date()
          .toISOString(),

      completed:
        false,

      currentQuestion:
        null,

      results: [],

      moduleIndex:
        0,

      diagnosis: {
        limit:
          createDiagnosisModuleState(),

        derivative:
          createDiagnosisModuleState(),

        integral:
          createDiagnosisModuleState()
      }
    };
  }


  function currentDiagnosisModule(
    session
  ) {
    while (
      session.moduleIndex <
        MODULE_KEYS.length &&
      session
        .diagnosis[
          MODULE_KEYS[
            session.moduleIndex
          ]
        ]
        .finished
    ) {
      session.moduleIndex +=
        1;
    }


    return (
      MODULE_KEYS[
        session.moduleIndex
      ] ||
      null
    );
  }


  function nextDiagnosticDifficulty(
    ds
  ) {
    if (
      ds.attempts ===
      0
    ) {
      return 6;
    }


    if (
      Number.isFinite(
        ds.lowCorrect
      ) &&
      Number.isFinite(
        ds.highWrong
      )
    ) {
      const low =
        Math.min(
          ds.lowCorrect,
          ds.highWrong
        );

      const high =
        Math.max(
          ds.lowCorrect,
          ds.highWrong
        );

      const midpoint =
        (
          low +
          high
        ) /
        2;


      if (
        Math.abs(
          high -
          low
        ) <=
        1.5
      ) {
        return round2(
          clamp(
            (
              midpoint +
              ds.ability
            ) /
            2,

            1,
            12
          )
        );
      }


      return round2(
        clamp(
          midpoint,
          1,
          12
        )
      );
    }


    const step =
      ds.attempts <=
        2
        ? 2
        : 1;


    if (
      ds.lastCorrect
    ) {
      return round2(
        clamp(
          ds.lastDifficulty +
          step,
          1,
          12
        )
      );
    }


    return round2(
      clamp(
        ds.lastDifficulty -
        step,
        1,
        12
      )
    );
  }


  function diagnosisPlan(
    session
  ) {
    const module =
      currentDiagnosisModule(
        session
      );


    if (!module) {
      return null;
    }


    const ds =
      session
        .diagnosis[
          module
        ];


    const targetDifficulty =
      nextDiagnosticDifficulty(
        ds
      );


    return {
      module,
      topic: null,
      targetDifficulty,
      purpose:
        'diagnosis',
      zone:
        'placement'
    };
  }


  function updateDiagnosisEstimate(
    session,
    question,
    correct
  ) {
    const module =
      question.module;


    const ds =
      session
        .diagnosis[
          module
        ];


    const b =
      Number(
        question
          .calibratedDifficulty ??
        question
          .provisionalDifficulty ??
        question
          .requestedDifficulty
      ) ||
      6;


    const before =
      ds.ability;


    const p =
      correctProbability(
        before,
        b
      );


    const k =
      0.75;


    const w =
      difficultyWeight(
        'diagnosis'
      );


    const after =
      clamp(
        before +
        k *
        (
          (
            correct
              ? 1
              : 0
          ) -
          p
        ) *
        w,

        1,
        13.5
      );


    ds.ability =
      round2(
        after
      );


    ds.attempts +=
      1;


    ds.lastDifficulty =
      b;


    ds.lastCorrect =
      correct;


    if (correct) {
      ds.lowCorrect =
        Number.isFinite(
          ds.lowCorrect
        )
          ? Math.max(
              ds.lowCorrect,
              b
            )
          : b;

    } else {
      ds.highWrong =
        Number.isFinite(
          ds.highWrong
        )
          ? Math.min(
              ds.highWrong,
              b
            )
          : b;
    }


    ds.recentAbilities.push(
      ds.ability
    );


    ds.recentAbilities =
      ds
        .recentAbilities
        .slice(
          -4
        );


    const baseConfidence =
      1 -
      Math.exp(
        -ds.attempts /
        3.2
      );


    const bracketBonus =
      (
        Number.isFinite(
          ds.lowCorrect
        ) &&
        Number.isFinite(
          ds.highWrong
        )
      )
        ? 0.12
        : 0;


    const spread =
      ds
        .recentAbilities
        .length >=
        2
        ? Math.max(
            ...ds
              .recentAbilities
          ) -
          Math.min(
            ...ds
              .recentAbilities
          )
        : 99;


    const stabilityPenalty =
      spread > 1.2
        ? 0.1
        : spread >
            0.7
          ? 0.05
          : 0;


    ds.confidence =
      round2(
        clamp(
          baseConfidence +
          bracketBonus -
          stabilityPenalty,

          0.1,
          0.96
        )
      );


    const hasBracket =
      Number.isFinite(
        ds.lowCorrect
      ) &&
      Number.isFinite(
        ds.highWrong
      );


    if (
      ds.attempts >=
        8 ||
      (
        ds.attempts >=
          5 &&
        ds.confidence >=
          0.8 &&
        (
          hasBracket ||
          ds.attempts >=
            6
        )
      )
    ) {
      ds.finished =
        true;


      state
        .profile
        .abilityByModule[
          module
        ] =
          round2(
            ds.ability
          );


      state
        .profile
        .confidenceByModule[
          module
        ] =
          ds.confidence;


      state
        .profile
        .effectiveAttemptsByModule[
          module
        ] =
          Math.max(
            state
              .profile
              .effectiveAttemptsByModule[
                module
              ] ||
            0,

            ds.attempts *
            0.6
          );


      syncDisplayLevel(
        module,
        true
      );
    }


    return {
      before:
        round2(
          before
        ),

      after:
        round2(
          after
        ),

      probability:
        round2(
          p
        ),

      k,

      weight: w,

      changed:
        true
    };
  }


  /*
  =========================================================
  Session lifecycle
  =========================================================
  */

  function createDailySession() {
    return {
      id:
        uid(
          'session'
        ),

      mode:
        'daily',

      startedAt:
        new Date()
          .toISOString(),

      completed:
        false,

      total:
        clamp(
          Number(
            state
              .settings
              .dailyCount
          ) ||
          10,

          8,
          12
        ),

      currentQuestion:
        null,

      results: [],

      usedReviewIds: []
    };
  }


  function createReviewSession(
    items
  ) {
    return {
      id:
        uid(
          'session'
        ),

      mode:
        'review',

      startedAt:
        new Date()
          .toISOString(),

      completed:
        false,

      total:
        Math.min(
          items.length,
          8
        ),

      currentQuestion:
        null,

      results: [],

      reviewIds:
        items
          .slice(
            0,
            8
          )
          .map(
            item =>
              item.id
          )
    };
  }


  function sessionContainerId(
    session
  ) {
    return {
      diagnosis:
        'diagnosisSession',

      daily:
        'dailySession',

      review:
        'reviewSession'
    }[
      session.mode
    ];
  }


  function sessionView(
    session
  ) {
    return {
      diagnosis:
        'diagnosis',

      daily:
        'daily',

      review:
        'review'
    }[
      session.mode
    ];
  }


  function renderSessionLoading(
    containerId,
    text =
      '正在准备下一题…'
  ) {
    const container =
      $(containerId);


    if (!container) {
      return;
    }


    container
      .classList
      .remove(
        'hidden'
      );


    container.innerHTML = `
      <div class="
        rounded-2xl
        border
        border-line
        bg-white
        p-8
        text-center
        shadow-soft
      ">
        <div class="
          mx-auto
          h-7
          w-7
          animate-spin
          rounded-full
          border-2
          border-line
          border-t-ink
        "></div>

        <div class="
          mt-4
          text-sm
          text-muted
        ">
          ${escapeHTML(text)}
        </div>
      </div>
    `;
  }


  async function ensureCurrentQuestion(
    session
  ) {
    if (
      session.completed ||
      session.currentQuestion
    ) {
      return;
    }


    const containerId =
      sessionContainerId(
        session
      );


    renderSessionLoading(
      containerId
    );


    let plan =
      null;


    if (
      session.mode ===
      'daily'
    ) {
      if (
        session
          .results
          .length >=
        session.total
      ) {
        finishSession(
          session
        );

        return;
      }


      plan =
        makeDailyPlan(
          session
        );


    } else if (
      session.mode ===
      'review'
    ) {
      if (
        session
          .results
          .length >=
        session.total
      ) {
        finishSession(
          session
        );

        return;
      }


      const reviewId =
        session
          .reviewIds[
            session
              .results
              .length
          ];


      const item =
        state
          .reviews
          .find(
            r =>
              r.id ===
              reviewId
          );


      if (!item) {
        session.results.push({
          skipped:
            true,

          correct:
            null,

          at:
            new Date()
              .toISOString()
        });


        return ensureCurrentQuestion(
          session
        );
      }


      const target =
        state
          .settings
          .difficultyMode ===
        'fixed'
          ? state
              .settings
              .manualLevels[
                item.module
              ]
          : Number(
              item
                .calibratedDifficulty ??
              item
                .provisionalDifficulty ??
              state
                .profile
                .abilityByModule[
                  item.module
                ]
            ) ||
            6;


      plan = {
        module:
          item.module,

        topic:
          item.topic,

        targetDifficulty:
          clamp(
            target,
            1,
            12
          ),

        purpose:
          'review',

        zone:
          'review',

        reviewId:
          item.id,

        referenceQuestion: {
          instruction:
            item.instruction,

          expression:
            item.expression,

          prompt:
            item.prompt,

          answer:
            item.answer,

          solution:
            item.solution
        }
      };


    } else if (
      session.mode ===
      'diagnosis'
    ) {
      plan =
        diagnosisPlan(
          session
        );


      if (!plan) {
        finishSession(
          session
        );

        return;
      }
    }


    const prefetched =
      await consumeSessionPrefetch(
        session,
        plan
      );


    if (prefetched) {
      session.currentQuestion =
        prefetched;

    } else {
      session.currentQuestion =
        await generateOneQuestion(
          plan
        );


      session
        .currentQuestion
        .zone =
          plan.zone ||
          plan.purpose;
    }


    saveState();

    renderActiveSession(
      containerId
    );
  }


  function sessionProgressText(
    session
  ) {
    if (
      session.mode ===
      'diagnosis'
    ) {
      const module =
        currentDiagnosisModule(
          session
        );


      if (!module) {
        return '诊断完成';
      }


      const ds =
        session
          .diagnosis[
            module
          ];


      return (
        `${moduleLabel(module)} · ` +
        `第 ${
          ds.attempts + 1
        } 题`
      );
    }


    return (
      `${
        Math.min(
          session
            .results
            .length +
          1,

          session.total
        )
      } / ${session.total}`
    );
  }


  function questionDifficultyLabel(
    question
  ) {
    /* 展示难度 = 生成时定的难度，不再让审核员的 suggested_difficulty 覆盖它。

       Task #4 起关掉这条覆盖，因为线上 50 题评测量出来它跑偏得很厉害：
       计划 L12 的题被显示成 L3/L4，计划 L10 的显示成 L5 —— 而同一批题的独立
       评估漂移只有一个难度档。也就是说这不是「审核员更准」，而是这条链路
       （reviewer 判 difficulty_reasonable=false → suggested_difficulty →
       displayDifficulty）本身不可靠，把一个高高度的值硬压下来。

       审核员的建议仍然照常记录（displayDifficulty 字段保留在后端响应里，
       也照常写进 q.metadataCorrection / 服务端日志），只是不参与界面，
       也不参与 IRT —— 这两件事本来就没走它。等拿到真实用户的作答数据、
       能对难度做真正的标定之后，再决定要不要启用。

       所以现在的优先级是 calibratedDifficulty → provisionalDifficulty →
       requestedDifficulty。注意它和下面这条历史注释并不矛盾：calibratedDifficulty
       在标定点不足时就是 provisionalDifficulty 的单调变换，两者谁先谁后都不改变
       「这是同一个 AI 猜测」这个事实；但它们都是生成时的判断，比事后被压下来的
       修正值更接近题目真正该在的位置。 */
    const b =
      Number(
        question
          .calibratedDifficulty ??
        question
          .provisionalDifficulty ??
        question
          .requestedDifficulty
      ) ||
      6;


    if (
      b >= 12.65
    ) {
      return 'Lv.12+';
    }


    return (
      `难度 ${b.toFixed(1)}`
    );
  }


  function renderActiveSession(
    containerId
  ) {
    const session =
      state.activeSession;


    const container =
      $(containerId);


    if (
      !session ||
      !container
    ) {
      return;
    }


    container
      .classList
      .remove(
        'hidden'
      );


    if (
      session.completed
    ) {
      renderSessionComplete(
        container,
        session
      );

      return;
    }


    const q =
      session
        .currentQuestion;


    if (!q) {
      ensureCurrentQuestion(
        session
      );

      return;
    }


    if (!trustedQuestion(q) || q.status === 'void') {
      voidQuestion(session,q,containerId);
      return;
    }

    const zone =
      q.zone ||
      q.planPurpose ||
      session.mode;


    container.innerHTML = `
      <article class="
        question-card
        question-enter
        overflow-hidden
        rounded-2xl
        border
        border-line
        bg-white
        shadow-soft
      ">

        <div class="
          border-b
          border-line
          px-5
          py-4

          sm:px-7
        ">
          <div class="
            flex
            flex-wrap
            items-center
            justify-between
            gap-3
          ">

            <div class="
              flex
              flex-wrap
              items-center
              gap-2
            ">
              <span class="
                rounded-full
                bg-[#f1f0ec]
                px-2.5
                py-1
                text-[11px]
                font-medium
                text-muted
              ">
                ${escapeHTML(
                  moduleLabel(
                    q.module
                  )
                )}
              </span>

              <span class="
                rounded-full
                bg-[#f1f0ec]
                px-2.5
                py-1
                text-[11px]
                font-medium
                text-muted
              ">
                ${escapeHTML(
                  q.displayTopic ||
                  q.topic ||
                  '综合基础'
                )}
              </span>

              <span
                id="difficultyBadge"
                class="
                  rounded-full
                  bg-claySoft
                  px-2.5
                  py-1
                  text-[11px]
                  font-medium
                  text-clay
                "
              >
                ${escapeHTML(
                  questionDifficultyLabel(
                    q
                  )
                )}
              </span>

              <span class="
                rounded-full
                bg-sageSoft
                px-2.5
                py-1
                text-[11px]
                font-medium
                text-sage
              ">
                ${escapeHTML(
                  zoneLabel(
                    zone
                  )
                )}
              </span>
            </div>


            <div class="
              text-xs
              text-muted
            ">
              ${escapeHTML(
                sessionProgressText(
                  session
                )
              )}
            </div>
          </div>
        </div>


        <div class="
          px-5
          py-6

          sm:px-7
          sm:py-8
        ">
          <div
            id="questionMathArea"
            class="
              min-w-0
              text-base
              leading-8
            "
          >
            ${questionPromptHTML(
              q
            )}
          </div>


          <div class="mt-7">
            <label
              for="answerInput"
              class="
                text-sm
                font-medium
              "
            >
              你的答案
            </label>

            <textarea
              id="answerInput"
              rows="3"
              spellcheck="false"
              class="
                mt-2
                w-full
                resize-y
                rounded-xl
                border
                border-line
                bg-[#fbfaf7]
                px-4
                py-3
                text-sm
                leading-6
                transition
                focus:border-[#c9c3ba]
                focus:bg-white
              "
              placeholder="支持普通表达式、LaTeX、小数、分数或中文数值"
            ></textarea>
          </div>


          <div
            id="answerFeedback"
            class="
              mt-5
              hidden
            "
          ></div>


          <div class="
            mt-6
            flex
            flex-wrap
            items-center
            justify-between
            gap-3
          ">

            <div class="
              text-xs
              text-muted
            ">
              ${
                q.source ===
                'fallback'
                  ? '备用题'
                  : ''
              }
            </div>


            <button
              id="submitAnswerBtn"
              class="
                rounded-xl
                bg-ink
                px-5
                py-2.5
                text-sm
                font-medium
                text-white
                hover:opacity-90
                disabled:cursor-not-allowed
                disabled:opacity-60
              "
            >
              提交答案
            </button>
          </div>
        </div>
      </article>
    `;


    $('submitAnswerBtn')
      ?.addEventListener(
        'click',
        () =>
          submitCurrentAnswer(
            containerId
          )
      );


    $('answerInput')
      ?.addEventListener(
        'keydown',
        event => {
          if (
            (
              event.metaKey ||
              event.ctrlKey
            ) &&
            event.key ===
              'Enter'
          ) {
            event.preventDefault();

            submitCurrentAnswer(
              containerId
            );
          }
        }
      );


    typesetMath(
      container
    );


    scheduleSpeculativePrefetch(
      session,
      q
    );
  }


  /*
  =========================================================
  Answer submission
  =========================================================
  */

  async function submitCurrentAnswer(
    containerId
  ) {
    const session =
      state.activeSession;


    const q =
      session
        ?.currentQuestion;


    const input =
      $('answerInput');


    const button =
      $('submitAnswerBtn');


    if (
      !session ||
      !q ||
      !input ||
      !button
    ) {
      return;
    }


    const userAnswer =
      input.value
        .trim();


    if (!userAnswer) {
      toast(
        '先写答案。'
      );

      return;
    }


    button.disabled =
      true;


    button.textContent =
      '判题中…';


    if (
      session.mode ===
      'diagnosis'
    ) {
      await waitForDifficultyEvaluation(
        q,
        900
      );
    }


    const verdict =
      await judgeAnswer(
        q,
        userAnswer,
        {
          session_id:
            session.id,

          question_sequence:
            session
              .results
              .length
        }
      );


    /* Task 5E：判题也可能「回来得太晚」。用户在这次判题期间已经交了卷、
       切了题、甚至结束了这一组题 —— 这时结论不能再往新题上套。
       （旧代码就有这道闸，这里只是把语义写清楚。） */
    if (state.activeSession !== session || session.currentQuestion !== q) {
      diagLog({
        level: 'info',
        action: 'judge',
        event: 'stale_verdict_discarded',
        kind: FAILURE_KINDS.STALE_RESPONSE,
        message: '判题结论落地时题目已经换过了',
        question_id: q?.question_id || q?.id || null,
        session_id: session.id,
        question_sequence: session.results.length,
        outcome: 'discarded'
      });

      /* 丢弃结论的同时必须把按钮恢复回去 —— 它是在 await 之前被禁用的。
         只 return 会让界面停在「判题中…」上，用户再也点不动。 */
      button.disabled = false;
      button.textContent = '提交答案';

      return;
    }

    if (verdict.trusted !== true || !trustedQuestion(q)) {
      // 处置方式由引擎统一决定：只有「题目本身不可信」才作废，
      // 网络/超时/协议类失败一律保留题目和用户答案。见 MathQuality.judgeOutcome。
      const outcome = MathQuality.judgeOutcome(verdict);
      if (outcome.action === 'void_question') {
        voidQuestion(session,q,containerId,userAnswer,verdict);
      } else {
        judgeUnavailable(verdict, userAnswer);
      }
      return;
    }

    let abilityResult =
      null;

    let topicResult =
      null;

    let historyRecord =
      null;

    let reviewMutation =
      null;


    if (
      !verdict
        .needsManualCheck &&
      typeof
        verdict.correct ===
      'boolean'
    ) {
      if (
        session.mode ===
        'diagnosis'
      ) {
        abilityResult =
          updateDiagnosisEstimate(
            session,
            q,
            verdict.correct
          );


        historyRecord =
          recordHistory({
            question:
              q,

            userAnswer,

            correct:
              verdict.correct,

            purpose:
              'diagnosis',

            abilityResult
          });


      } else {
        const purpose =
          q.planPurpose ===
            'review'
            ? 'review'
            : 'daily';


        recordPracticeStats(
          q,
          verdict.correct
        );


        const b =
          Number(
            q
              .calibratedDifficulty ??
            q
              .provisionalDifficulty ??
            q
              .requestedDifficulty
          ) ||
          6;


        abilityResult =
          updateAbility(
            q.module,
            b,
            verdict.correct,
            purpose
          );


        topicResult =
          updateTopicMastery(
            q,
            verdict.correct,
            purpose
          );


        if (
          purpose ===
          'review'
        ) {
          reviewMutation =
            updateReviewItem(
              q.reviewId,
              verdict.correct
            );

        } else if (
          !verdict.correct
        ) {
          reviewMutation =
            queueWrongQuestion(
              q
            );
        }


        historyRecord =
          recordHistory({
            question:
              q,

            userAnswer,

            correct:
              verdict.correct,

            purpose,

            abilityResult,

            topicResult
          });
      }

    } else {
      historyRecord =
        recordHistory({
          question:
            q,

          userAnswer,

          correct:
            null,

          purpose:
            session.mode,

          needsManualCheck:
            true
        });
    }


    const result = {
      questionId:
        q.id,

      module:
        q.module,

      topic:
        q.topic,

      correct:
        verdict
          .needsManualCheck
          ? null
          : verdict.correct,

      needsManualCheck:
        Boolean(
          verdict
            .needsManualCheck
        ),

      userAnswer,

      feedback:
        verdict.feedback ||
        '',

      zone:
        q.zone ||
        q.planPurpose,

      difficulty:
        q
          .calibratedDifficulty ??
        q
          .provisionalDifficulty ??
        q
          .requestedDifficulty,

      abilityBefore:
        abilityResult
          ?.before ??
        null,

      abilityAfter:
        abilityResult
          ?.after ??
        null,

      topicAbilityBefore:
        topicResult
          ?.before ??
        null,

      topicAbilityAfter:
        topicResult
          ?.after ??
        null,

      historyId:
        historyRecord
          ?.id ||
        null,

      reviewMutation,

      errorType:
        (
          verdict.correct ===
            false &&
          session.mode !==
            'diagnosis'
        )
          ? null
          : 'not_applicable',

      at:
        new Date()
          .toISOString()
    };


    session.results.push(
      result
    );


    saveState();


    scheduleSessionPrefetch(
      session
    );


    renderAnswerFeedback(
      session,
      q,
      result,
      verdict,
      containerId
    );


    const issueButton=document.createElement('button');
    issueButton.textContent='反馈题目问题';
    issueButton.className='mt-4 text-sm';
    issueButton.addEventListener('click',()=>{ reportQuestionIssue(q,userAnswer,verdict); toast('问题已记录，谢谢反馈。'); });
    $(containerId).appendChild(issueButton);

    renderSidebarReviewBadge();
    renderDashboard();
    renderReviewIntro();
  }


  /*
  =========================================================
  Error classification
  =========================================================
  */

  const ERROR_FACTORS = {
    knowledge: {
      label:
        '不会做',

      ability:
        1,

      topic:
        1,

      excludeFromStats:
        false
    },

    method: {
      label:
        '方法想错',

      ability:
        0.8,

      topic:
        0.85,

      excludeFromStats:
        false
    },

    careless: {
      label:
        '计算粗心',

      ability:
        0.4,

      topic:
        0.45,

      excludeFromStats:
        false
    },

    input: {
      label:
        '输入失误',

      ability:
        0,

      topic:
        0,

      excludeFromStats:
        true
    }
  };


  function classifyWrongAttempt(
    session,
    question,
    result,
    errorType
  ) {
    if (
      result.correct !==
        false ||
      session.mode ===
        'diagnosis' ||
      result.errorType
    ) {
      return;
    }


    const config =
      ERROR_FACTORS[
        errorType
      ] ||
      ERROR_FACTORS
        .knowledge;


    result.errorType =
      errorType;


    const historyItem =
      state
        .history
        .find(
          item =>
            item.id ===
            result.historyId
        );


    if (
      state
        .settings
        .difficultyMode ===
        'adaptive' &&
      result.abilityBefore !==
        null &&
      result.abilityAfter !==
        null
    ) {
      const before =
        Number(
          result
            .abilityBefore
        );


      const oldAfter =
        Number(
          result
            .abilityAfter
        );


      const originalDelta =
        oldAfter -
        before;


      const adjustedAfter =
        before +
        originalDelta *
        config.ability;


      const current =
        Number(
          state
            .profile
            .abilityByModule[
              question.module
            ]
        ) ||
        oldAfter;


      state
        .profile
        .abilityByModule[
          question.module
        ] =
          round2(
            clamp(
              current +
              (
                adjustedAfter -
                oldAfter
              ),

              1,
              13.5
            )
          );


      result.abilityAfter =
        round2(
          adjustedAfter
        );


      const originalWeight =
        Number(
          historyItem
            ?.abilityWeight ||
          0
        );


      if (
        originalWeight > 0
      ) {
        state
          .profile
          .effectiveAttemptsByModule[
            question.module
          ] =
            Math.max(
              0,

              Number(
                state
                  .profile
                  .effectiveAttemptsByModule[
                    question.module
                  ]
              ) -
              originalWeight *
              (
                1 -
                config.ability
              )
            );
      }


      syncDisplayLevel(
        question.module
      );


      if (
        historyItem
      ) {
        historyItem
          .abilityAfter =
            result
              .abilityAfter;


        historyItem
          .abilityWeight =
            originalWeight *
            config.ability;
      }
    }


    const topic =
      getTopicStat(
        question.module,
        question.topic ||
        '综合基础'
      );


    if (
      topic &&
      result
        .topicAbilityBefore !==
        null &&
      result
        .topicAbilityAfter !==
        null
    ) {
      const before =
        Number(
          result
            .topicAbilityBefore
        );


      const oldAfter =
        Number(
          result
            .topicAbilityAfter
        );


      const adjustedAfter =
        before +
        (
          oldAfter -
          before
        ) *
        config.topic;


      topic.ability =
        round2(
          clamp(
            Number(
              topic.ability
            ) +
            (
              adjustedAfter -
              oldAfter
            ),

            1,
            13.5
          )
        );


      result.topicAbilityAfter =
        round2(
          adjustedAfter
        );


      if (
        historyItem
      ) {
        historyItem
          .topicAbilityAfter =
            result
              .topicAbilityAfter;
      }
    }


    if (
      config
        .excludeFromStats
    ) {
      state.stats.attempts =
        Math.max(
          0,
          state
            .stats
            .attempts -
          1
        );


      const moduleStat =
        state
          .stats
          .byModule[
            question.module
          ];


      moduleStat.attempts =
        Math.max(
          0,
          moduleStat.attempts -
          1
        );


      const topicStat =
        getTopicStat(
          question.module,
          question.topic ||
          '综合基础'
        );


      if (
        topicStat
      ) {
        topicStat.attempts =
          Math.max(
            0,
            topicStat.attempts -
            1
          );


        topicStat.confidence =
          round2(
            clamp(
              1 -
              Math.exp(
                -topicStat.attempts /
                12
              ),

              0.15,
              0.98
            )
          );
      }


      undoReviewMutation(
        result
          .reviewMutation
      );


      if (
        historyItem
      ) {
        historyItem
          .countsTowardStats =
            false;
      }
    }


    if (
      historyItem
    ) {
      historyItem.errorType =
        errorType;
    }


    saveState();

    renderDashboard();

    renderSidebarReviewBadge();

    renderReviewIntro();


    const note =
      $('errorTypeNote');


    if (note) {
      note.textContent =
        errorType ===
          'input'
          ? '已按输入失误处理，不计入统计或错题。'
          : `已记录为“${config.label}”。`;
    }


    $$('.error-type-btn')
      .forEach(
        btn => {
          btn.disabled =
            true;

          btn.classList.add(
            'opacity-50'
          );
        }
      );
  }


  /*
  =========================================================
  Answer feedback
  =========================================================
  */

  function renderAnswerFeedback(
    session,
    q,
    result,
    verdict,
    containerId
  ) {
    const feedback =
      $('answerFeedback');


    const button =
      $('submitAnswerBtn');


    if (
      !feedback ||
      !button
    ) {
      return;
    }


    feedback
      .classList
      .remove(
        'hidden'
      );


    const statusType =
      verdict
        .needsManualCheck
        ? 'manual'
        : verdict.correct
          ? 'correct'
          : 'wrong';


    const statusTitle = {
      correct:
        '答对了',

      wrong:
        '这题需要再看一下',

      manual:
        '暂时无法自动确认'
    }[
      statusType
    ];


    const statusSymbol = {
      correct:
        '✓',

      wrong:
        '×',

      manual:
        '?'
    }[
      statusType
    ];


    const boxClass = {
      correct:
        'border-[#cddccf] bg-[#f6faf6]',

      wrong:
        'border-[#e7c4b7] bg-[#fff9f6]',

      manual:
        'border-[#ddd8cf] bg-[#faf9f6]'
    }[
      statusType
    ];


    const titleClass = {
      correct:
        'text-sage',

      wrong:
        'text-clay',

      manual:
        'text-[#6f6a63]'
    }[
      statusType
    ];


    feedback.innerHTML = `
      <div class="
        rounded-xl
        border
        p-4
        ${boxClass}
      ">
        <div class="
          flex
          items-center
          gap-2
          text-sm
          font-semibold
          ${titleClass}
        ">
          <span>
            ${statusSymbol}
          </span>

          <span>
            ${statusTitle}
          </span>
        </div>


        <div class="
          mt-3
          text-sm
          leading-7
          text-ink
        ">
          <span class="
            text-muted
          ">
            参考答案：
          </span>

          ${answerMathHTML(
            q.answer
          )}
        </div>


        ${
          verdict.feedback
            ? `
              <div class="
                mt-2
                text-sm
                leading-6
                text-muted
              ">
                ${escapeHTML(
                  verdict.feedback
                )}
              </div>
            `
            : ''
        }


        ${
          (
            statusType ===
              'wrong' &&
            session.mode !==
              'diagnosis'
          )
            ? `
              <div class="
                mt-3
                rounded-lg
                border
                border-line
                bg-white
                p-3
              ">
                <div class="
                  text-xs
                  font-medium
                  text-ink
                ">
                  这次错误更接近哪一种？
                </div>

                <div class="
                  mt-2
                  flex
                  flex-wrap
                  gap-2
                ">
                  <button
                    class="
                      error-type-btn
                      rounded-lg
                      border
                      border-line
                      px-2.5
                      py-1.5
                      text-xs
                      hover:bg-[#faf9f6]
                    "
                    data-error-type="knowledge"
                  >
                    不会做
                  </button>

                  <button
                    class="
                      error-type-btn
                      rounded-lg
                      border
                      border-line
                      px-2.5
                      py-1.5
                      text-xs
                      hover:bg-[#faf9f6]
                    "
                    data-error-type="method"
                  >
                    方法想错
                  </button>

                  <button
                    class="
                      error-type-btn
                      rounded-lg
                      border
                      border-line
                      px-2.5
                      py-1.5
                      text-xs
                      hover:bg-[#faf9f6]
                    "
                    data-error-type="careless"
                  >
                    计算粗心
                  </button>

                  <button
                    class="
                      error-type-btn
                      rounded-lg
                      border
                      border-line
                      px-2.5
                      py-1.5
                      text-xs
                      hover:bg-[#faf9f6]
                    "
                    data-error-type="input"
                  >
                    输入失误
                  </button>
                </div>

                <div
                  id="errorTypeNote"
                  class="
                    mt-2
                    text-[11px]
                    leading-5
                    text-muted
                  "
                >
                  不选择时默认按“不会做”记录。输入失误不会计入统计或错题。
                </div>
              </div>
            `
            : ''
        }


        ${
          verdict
            .needsManualCheck
            ? `
              <div class="
                mt-3
                rounded-lg
                bg-white
                px-3
                py-2.5
                text-xs
                leading-5
                text-muted
              ">
                这道题暂不计入学习统计。
              </div>
            `
            : ''
        }


        <details class="
          mt-4
          rounded-lg
          border
          border-line
          bg-white
          px-3.5
          py-3
        ">
          <summary class="
            cursor-pointer
            text-sm
            font-medium
          ">
            查看解析
          </summary>

          <div class="
            mt-3
            text-sm
            leading-7
            text-muted
          ">
            ${smartRichMathHTML(
              q.solution ||
              '暂无解析。'
            )}
          </div>
        </details>


        <div class="
          mt-4
          flex
          justify-end
        ">
          <button
            id="nextQuestionBtn"
            class="
              rounded-xl
              bg-ink
              px-4
              py-2.5
              text-sm
              font-medium
              text-white
              hover:opacity-90
            "
          >
            ${nextButtonLabel(
              session
            )}
          </button>
        </div>
      </div>
    `;


    button
      .classList
      .add(
        'hidden'
      );


    $$('.error-type-btn')
      .forEach(
        errorButton => {
          errorButton
            .addEventListener(
              'click',
              () => {
                classifyWrongAttempt(
                  session,
                  q,
                  result,
                  errorButton
                    .dataset
                    .errorType
                );
              }
            );
        }
      );


    $('nextQuestionBtn')
      ?.addEventListener(
        'click',
        async () => {
          if (
            result.correct ===
              false &&
            session.mode !==
              'diagnosis' &&
            !result.errorType
          ) {
            classifyWrongAttempt(
              session,
              q,
              result,
              'knowledge'
            );
          }


          session.currentQuestion =
            null;


          if (
            session.mode ===
              'daily' &&
            session
              .results
              .length >=
              session.total
          ) {
            finishSession(
              session
            );

          } else if (
            session.mode ===
              'review' &&
            session
              .results
              .length >=
              session.total
          ) {
            finishSession(
              session
            );

          } else if (
            session.mode ===
            'diagnosis'
          ) {
            const module =
              q.module;


            const ds =
              session
                .diagnosis[
                  module
                ];


            if (
              ds.finished
            ) {
              currentDiagnosisModule(
                session
              );
            }


            if (
              !currentDiagnosisModule(
                session
              )
            ) {
              finishSession(
                session
              );
            }
          }


          saveState();


          if (
            !session.completed
          ) {
            renderSessionLoading(
              containerId
            );

            await ensureCurrentQuestion(
              session
            );

          } else {
            renderActiveSession(
              containerId
            );
          }
        }
      );


    typesetMath(
      feedback
    );
  }


  function nextButtonLabel(
    session
  ) {
    if (
      session.mode ===
      'diagnosis'
    ) {
      const allFinished =
        MODULE_KEYS.every(
          m =>
            session
              .diagnosis[
                m
              ]
              .finished
        );


      return allFinished
        ? '查看结果'
        : '下一题';
    }


    return (
      session
        .results
        .length >=
        session.total
        ? '查看结果'
        : '下一题'
    );
  }


  /*
  =========================================================
  Session completion
  =========================================================
  */

  function finishSession(
    session
  ) {
    sessionPrefetch.delete(
      session.id
    );


    session.completed =
      true;


    session.completedAt =
      new Date()
        .toISOString();


    session.currentQuestion =
      null;


    if (
      session.mode ===
      'diagnosis'
    ) {
      MODULE_KEYS.forEach(
        module => {
          const ds =
            session
              .diagnosis[
                module
              ];


          if (
            !ds.finished &&
            ds.attempts >
              0
          ) {
            state
              .profile
              .abilityByModule[
                module
              ] =
                round2(
                  ds.ability
                );


            state
              .profile
              .confidenceByModule[
                module
              ] =
                ds.confidence;


            syncDisplayLevel(
              module,
              true
            );
          }
        }
      );


      state
        .profile
        .diagnosed =
          true;


      state
        .profile
        .diagnosisCompletedAt =
          new Date()
            .toISOString();


      state
        .profile
        .placementSource =
          'adaptive-diagnosis';
    }


    if (
      session.mode ===
      'daily'
    ) {
      if (
        !state
          .checkins
          .includes(
            todayISO()
          )
      ) {
        state
          .checkins
          .push(
            todayISO()
          );


        state
          .checkins
          .sort();
      }


      state
        .dailyMeta
        .lastCompletedDate =
          todayISO();
    }


    saveState();

    renderAll();
  }


  function renderSessionComplete(
    container,
    session
  ) {
    const judged =
      session
        .results
        .filter(
          r =>
            typeof
              r.correct ===
            'boolean'
        );


    const correctCount =
      judged.filter(
        r =>
          r.correct
      ).length;


    const judgedCount =
      judged.length;


    const manualCount =
      session
        .results
        .filter(
          r =>
            r.needsManualCheck
        )
        .length;


    const rate =
      judgedCount
        ? Math.round(
            (
              correctCount /
              judgedCount
            ) *
            100
          )
        : null;


    let extra =
      '';


    if (
      session.mode ===
      'diagnosis'
    ) {
      extra = `
        <div class="
          mt-6
          grid
          gap-2

          sm:grid-cols-3
        ">
          ${MODULE_KEYS
            .map(
              module => `
                <div class="
                  rounded-xl
                  bg-[#f7f6f2]
                  p-4
                  text-left
                ">
                  <div class="
                    text-xs
                    text-muted
                  ">
                    ${moduleLabel(
                      module
                    )}
                  </div>

                  <div class="
                    mt-2
                    text-lg
                    font-semibold
                  ">
                    ${displayLevelLabel(
                      module
                    )}
                  </div>
                </div>
              `
            )
            .join('')
          }
        </div>
      `;

    } else if (
      session.mode ===
      'daily'
    ) {
      extra = `
        <div class="
          mt-5
          rounded-xl
          bg-sageSoft
          px-4
          py-3
          text-sm
          text-sage
        ">
          今日练习已记录。
        </div>
      `;

    } else {
      const remaining =
        state
          .reviews
          .filter(
            r =>
              r.highFreq !==
              false
          )
          .length;


      extra = `
        <div class="
          mt-5
          rounded-xl
          bg-[#f7f6f2]
          px-4
          py-3
          text-sm
          text-muted
        ">
          还有 ${remaining} 个考点在复习队列中。
        </div>
      `;
    }


    const scoreText =
      judgedCount
        ? `${correctCount}/${judgedCount} 正确 · ${rate}%`
        : '本组暂无可自动确认的判题结果';


    const nextTarget =
      session.mode ===
        'diagnosis'
        ? 'daily'
        : session.mode ===
            'daily'
          ? (
              dueReviews()
                .length
                ? 'review'
                : 'dashboard'
            )
          : 'daily';


    const nextText =
      session.mode ===
        'diagnosis'
        ? '开始练习'
        : session.mode ===
            'daily'
          ? (
              dueReviews()
                .length
                ? '去复习'
                : '查看学习分析'
            )
          : '完成';


    container.innerHTML = `
      <div class="
        mx-auto
        max-w-2xl
        rounded-2xl
        border
        border-line
        bg-white
        p-7
        text-center
        shadow-soft

        sm:p-9
      ">
        <div class="
          mx-auto
          grid
          h-12
          w-12
          place-items-center
          rounded-full

          ${
            rate === null
              ? 'bg-[#efede8] text-muted'
              : rate >= 70
                ? 'bg-sageSoft text-sage'
                : 'bg-claySoft text-clay'
          }

          text-xl
        ">
          ${
            rate === null
              ? '?'
              : rate >= 70
                ? '✓'
                : '↗'
          }
        </div>


        <h2 class="
          mt-5
          text-2xl
          font-semibold
          tracking-tight
        ">
          ${
            session.mode ===
              'diagnosis'
              ? '诊断完成'
              : '完成'
          }
        </h2>


        <p class="
          mt-2
          text-sm
          text-muted
        ">
          ${scoreText}
        </p>


        ${
          manualCount
            ? `
              <p class="
                mt-2
                text-xs
                text-muted
              ">
                另有 ${manualCount} 道题暂未自动判定。
              </p>
            `
            : ''
        }


        ${extra}


        <div class="
          mt-7
          flex
          flex-wrap
          justify-center
          gap-2
        ">
          <button
            class="
              rounded-xl
              border
              border-line
              bg-white
              px-4
              py-2.5
              text-sm
              font-medium
              hover:bg-[#faf9f6]
            "
            data-complete-target="dashboard"
          >
            学习分析
          </button>


          ${
            session.mode ===
              'diagnosis' &&
            state
              .settings
              .difficultyMode ===
              'fixed'
              ? `
                <button
                  id="useDiagnosisAdaptiveBtn"
                  class="
                    rounded-xl
                    border
                    border-sage
                    bg-sageSoft
                    px-4
                    py-2.5
                    text-sm
                    font-medium
                    text-sage
                    hover:opacity-90
                  "
                >
                  使用诊断结果
                </button>
              `
              : ''
          }


          <button
            class="
              rounded-xl
              bg-ink
              px-4
              py-2.5
              text-sm
              font-medium
              text-white
              hover:opacity-90
            "
            data-complete-target="${nextTarget}"
          >
            ${nextText}
          </button>
        </div>
      </div>
    `;


    $('useDiagnosisAdaptiveBtn')
      ?.addEventListener(
        'click',
        () => {
          state
            .settings
            .difficultyMode =
              'adaptive';


          state
            .profile
            .placementSource =
              'adaptive-diagnosis';


          saveState();

          renderAll();


          state.activeSession =
            null;


          saveState();

          switchView(
            'daily'
          );
        }
      );


    container
      .querySelectorAll(
        '[data-complete-target]'
      )
      .forEach(
        btn => {
          btn
            .addEventListener(
              'click',
              () => {
                state.activeSession =
                  null;


                saveState();


                $('diagnosisSession')
                  ?.classList
                  .add(
                    'hidden'
                  );


                $('dailySession')
                  ?.classList
                  .add(
                    'hidden'
                  );


                $('reviewSession')
                  ?.classList
                  .add(
                    'hidden'
                  );


                $('diagnosisIntro')
                  ?.classList
                  .remove(
                    'hidden'
                  );


                $('dailyIntro')
                  ?.classList
                  .remove(
                    'hidden'
                  );


                switchView(
                  btn
                    .dataset
                    .completeTarget
                );
              }
            );
        }
      );
  }


  /*
  =========================================================
  Start actions
  =========================================================
  */

  async function startDiagnosis() {
    state.activeSession =
      createDiagnosisSession();


    saveState();


    $('diagnosisIntro')
      ?.classList
      .add(
        'hidden'
      );


    $('diagnosisSession')
      ?.classList
      .remove(
        'hidden'
      );


    renderSessionLoading(
      'diagnosisSession',
      '正在准备第一题…'
    );


    const warmed =
      await consumeWarmup(
        'diagnosis',
        state.activeSession
      );


    if (warmed) {
      state
        .activeSession
        .currentQuestion =
          warmed;


      saveState();


      renderActiveSession(
        'diagnosisSession'
      );

    } else {
      await ensureCurrentQuestion(
        state.activeSession
      );
    }
  }


  async function startDaily() {
    state.activeSession =
      createDailySession();


    saveState();


    $('dailyIntro')
      ?.classList
      .add(
        'hidden'
      );


    $('dailyOnboarding')
      ?.classList
      .add(
        'hidden'
      );


    $('dailySession')
      ?.classList
      .remove(
        'hidden'
      );


    renderSessionLoading(
      'dailySession',
      '正在准备第一题…'
    );


    const warmed =
      await consumeWarmup(
        'daily',
        state.activeSession
      );


    if (warmed) {
      state
        .activeSession
        .currentQuestion =
          warmed;


      saveState();


      renderActiveSession(
        'dailySession'
      );

    } else {
      await ensureCurrentQuestion(
        state.activeSession
      );
    }
  }


  async function startReview() {
    const items =
      dueReviews();


    if (
      !items.length
    ) {
      toast(
        '今天没有待复习的题。'
      );

      return;
    }


    state.activeSession =
      createReviewSession(
        items
      );


    saveState();


    $('reviewSession')
      ?.classList
      .remove(
        'hidden'
      );


    renderSessionLoading(
      'reviewSession',
      '正在准备复习题…'
    );


    await ensureCurrentQuestion(
      state.activeSession
    );
  }


  function skipDiagnosis() {
    state
      .profile
      .placementSource =
        'skipped-diagnosis';


    saveState();


    renderAll();

    switchView(
      'daily'
    );
  }


  /*
  =========================================================
  Dashboard
  =========================================================
  */

  function computeStreak() {
    const set =
      new Set(
        state.checkins
      );


    let streak = 0;
    let offset = 0;


    if (
      !set.has(
        todayISO()
      )
    ) {
      offset =
        -1;
    }


    while (
      set.has(
        dateOffsetISO(
          offset
        )
      )
    ) {
      streak +=
        1;

      offset -=
        1;
    }


    return streak;
  }


  function renderSidebarReviewBadge() {
    const count =
      dueReviews()
        .length;


    const el =
      $('sidebarReviewCount');


    if (!el) {
      return;
    }


    el.textContent =
      count;


    if (
      count > 0
    ) {
      el.classList.remove(
        'hidden'
      );

    } else {
      el.classList.add(
        'hidden'
      );
    }
  }


  function currentTodayDone() {
    const now =
      new Date();


    return state
      .history
      .filter(
        item => {
          if (!item.at) {
            return false;
          }


          const date =
            new Date(
              item.at
            );


          return (
            date.getFullYear() ===
              now.getFullYear() &&
            date.getMonth() ===
              now.getMonth() &&
            date.getDate() ===
              now.getDate() &&
            item.purpose !==
              'diagnosis'
          );
        }
      )
      .length;
  }


  function renderDiagnosisSummary() {
    const el =
      $('diagnosisSummary');


    if (!el) {
      return;
    }


    if (
      !state
        .profile
        .diagnosed
    ) {
      el.classList.add(
        'hidden'
      );


      el.innerHTML =
        '';


      return;
    }


    el.classList.remove(
      'hidden'
    );


    el.innerHTML = `
      <div>
        <div class="
          font-medium
        ">
          上次诊断
        </div>

        <div class="
          mt-1
          text-xs
          text-muted
        ">
          ${
            state
              .profile
              .diagnosisCompletedAt
              ? formatDateTimeShort(
                  state
                    .profile
                    .diagnosisCompletedAt
                )
              : '已完成'
          }
        </div>
      </div>


      <div class="
        mt-4
        grid
        gap-2

        sm:grid-cols-3
      ">
        ${MODULE_KEYS
          .map(
            module => `
              <div class="
                rounded-lg
                bg-white
                px-3
                py-3
              ">
                <div class="
                  text-xs
                  text-muted
                ">
                  ${moduleLabel(
                    module
                  )}
                </div>

                <div class="
                  mt-1
                  font-semibold
                ">
                  ${displayLevelLabel(
                    module
                  )}
                </div>
              </div>
            `
          )
          .join('')
        }
      </div>
    `;
  }


  function renderRecentHistory() {
    const el =
      $('recentHistory');


    if (!el) {
      return;
    }


    const rows =
      state
        .history
        .slice()
        .reverse()
        .slice(
          0,
          6
        );


    if (
      !rows.length
    ) {
      el.innerHTML = `
        <div class="
          rounded-xl
          bg-[#f7f6f2]
          p-4
          text-sm
          text-muted
        ">
          完成一些练习后，最近记录会显示在这里。
        </div>
      `;

      return;
    }


    el.innerHTML =
      rows
        .map(
          item => {
            const status =
              item
                .needsManualCheck
                ? {
                    text:
                      '未确认',

                    cls:
                      'bg-[#efede8] text-muted'
                  }
                : item.correct ===
                    true
                  ? {
                      text:
                        '答对',

                      cls:
                        'bg-sageSoft text-sage'
                    }
                  : item.correct ===
                      false
                    ? {
                        text:
                          '答错',

                        cls:
                          'bg-claySoft text-clay'
                      }
                    : {
                        text:
                          '不计分',

                        cls:
                          'bg-[#efede8] text-muted'
                      };


            const diff =
              Number(
                item
                  .calibratedDifficulty ??
                item
                  .provisionalDifficulty ??
                item
                  .requestedDifficulty
              );


            return `
              <div class="
                rounded-xl
                border
                border-line
                bg-[#faf9f6]
                p-3.5
              ">
                <div class="
                  flex
                  items-start
                  justify-between
                  gap-3
                ">
                  <div class="min-w-0">

                    <div class="
                      flex
                      flex-wrap
                      items-center
                      gap-2
                    ">
                      <span class="
                        text-xs
                        font-medium
                      ">
                        ${moduleLabel(
                          item.module
                        )}
                      </span>

                      <span class="
                        text-[11px]
                        text-muted
                      ">
                        ${escapeHTML(
                          item.topic ||
                          '综合基础'
                        )}
                      </span>

                      ${
                        Number.isFinite(
                          diff
                        )
                          ? `
                            <span class="
                              text-[11px]
                              text-muted
                            ">
                              L${diff.toFixed(1)}
                            </span>
                          `
                          : ''
                      }
                    </div>


                    <div class="
                      mt-1
                      truncate
                      text-[11px]
                      text-muted
                    ">
                      ${escapeHTML(
                        item.instruction ||
                        item.prompt ||
                        '练习题'
                      )}
                    </div>
                  </div>


                  <span class="
                    shrink-0
                    rounded-full
                    px-2
                    py-0.5
                    text-[11px]
                    font-medium
                    ${status.cls}
                  ">
                    ${status.text}
                  </span>
                </div>


                <div class="
                  mt-2
                  text-[11px]
                  text-muted
                ">
                  ${formatDateTimeShort(
                    item.at
                  )}
                </div>
              </div>
            `;
          }
        )
        .join('');
  }


  function renderReviewQueueList() {
    const el =
      $('reviewQueueList');


    if (!el) {
      return;
    }


    const rows =
      state
        .reviews
        .filter(
          item =>
            item.highFreq !==
            false
        )
        .slice()
        .sort(
          (
            a,
            b
          ) => {
            const ad =
              a.nextReviewAt ||
              '9999-12-31';

            const bd =
              b.nextReviewAt ||
              '9999-12-31';

            return ad.localeCompare(
              bd
            );
          }
        );


    if (
      !rows.length
    ) {
      el.innerHTML = `
        <div class="
          rounded-2xl
          border
          border-dashed
          border-line
          bg-white/50
          p-6
          text-sm
          text-muted

          md:col-span-2
          xl:col-span-3
        ">
          暂无错题复习。
        </div>
      `;

      return;
    }


    el.innerHTML =
      rows
        .map(
          item => {
            const due =
              item.nextReviewAt &&
              item.nextReviewAt <=
                todayISO();


            const diff =
              Number(
                item
                  .calibratedDifficulty ??
                item
                  .provisionalDifficulty ??
                6
              );


            return `
              <article class="
                rounded-2xl
                border
                ${
                  due
                    ? 'border-[#e6b7a8] bg-[#fffaf7]'
                    : 'border-line bg-white'
                }
                p-4
                shadow-soft
              ">
                <div class="
                  flex
                  items-start
                  justify-between
                  gap-3
                ">
                  <div>
                    <div class="
                      text-sm
                      font-semibold
                    ">
                      ${escapeHTML(
                        item.topic ||
                        '综合基础'
                      )}
                    </div>

                    <div class="
                      mt-1
                      text-[11px]
                      text-muted
                    ">
                      ${moduleLabel(
                        item.module
                      )}
                      ·
                      L${
                        Number.isFinite(
                          diff
                        )
                          ? diff.toFixed(1)
                          : '—'
                      }
                    </div>
                  </div>

                  <span class="
                    rounded-full
                    ${
                      due
                        ? 'bg-claySoft text-clay'
                        : 'bg-[#efede8] text-muted'
                    }
                    px-2
                    py-0.5
                    text-[11px]
                    font-medium
                  ">
                    ${
                      due
                        ? '到期'
                        : '等待复习'
                    }
                  </span>
                </div>


                <div class="
                  mt-4
                  grid
                  grid-cols-2
                  gap-2
                  text-xs
                ">
                  <div class="
                    rounded-lg
                    bg-[#f7f6f2]
                    px-3
                    py-2
                  ">
                    <div class="text-muted">
                      累计错误
                    </div>

                    <div class="
                      mt-1
                      font-semibold
                    ">
                      ${
                        item.wrongCount ||
                        0
                      } 次
                    </div>
                  </div>


                  <div class="
                    rounded-lg
                    bg-[#f7f6f2]
                    px-3
                    py-2
                  ">
                    <div class="text-muted">
                      复习连对
                    </div>

                    <div class="
                      mt-1
                      font-semibold
                    ">
                      ${
                        item.correctStreak ||
                        0
                      }/3
                    </div>
                  </div>
                </div>


                <div class="
                  mt-3
                  text-[11px]
                  text-muted
                ">
                  ${formatReviewDate(
                    item.nextReviewAt
                  )}
                </div>
              </article>
            `;
          }
        )
        .join('');
  }


  function renderDashboard() {
    if (
      !$('todayDone')
    ) {
      return;
    }


    const done =
      currentTodayDone();


    $('todayDone')
      .textContent =
        done;


    $('todayStatus')
      .textContent =
        state
          .dailyMeta
          .lastCompletedDate ===
        todayISO()
          ? '已完成'
          : '未完成';


    $('streakCount')
      .textContent =
        computeStreak();


    $('dueReviewCount')
      .textContent =
        dueReviews()
          .length;


    const overall =
      accuracy(
        state
          .stats
          .correct,

        state
          .stats
          .attempts
      );


    $('overallAccuracy')
      .textContent =
        overall === null
          ? '—'
          : `${overall}%`;


    $('moduleAbilityList')
      .innerHTML =
        MODULE_KEYS
          .map(
            module => {
              const stat =
                state
                  .stats
                  .byModule[
                    module
                  ];


              const acc =
                accuracy(
                  stat.correct,
                  stat.attempts
                );


              const theta =
                state
                  .settings
                  .difficultyMode ===
                'fixed'
                  ? state
                      .settings
                      .manualLevels[
                        module
                      ]
                  : state
                      .profile
                      .abilityByModule[
                        module
                      ];


              const levelText =
                displayLevelLabel(
                  module
                );


              const width =
                clamp(
                  (
                    (
                      Number(
                        theta
                      ) ||
                      1
                    ) /
                    12
                  ) *
                  100,

                  4,
                  100
                );


              return `
                <div>
                  <div class="
                    flex
                    items-center
                    justify-between
                    gap-4
                  ">
                    <div>
                      <div class="
                        text-sm
                        font-medium
                      ">
                        ${moduleLabel(
                          module
                        )}
                      </div>
                    </div>


                    <div class="text-right">
                      <div class="
                        text-sm
                        font-semibold
                      ">
                        ${levelText}
                      </div>

                      <div class="
                        mt-1
                        text-[11px]
                        text-muted
                      ">
                        ${
                          acc === null
                            ? '暂无正确率'
                            : `正确率 ${acc}%`
                        }
                      </div>
                    </div>
                  </div>


                  <div class="
                    mt-3
                    h-1.5
                    overflow-hidden
                    rounded-full
                    bg-[#efede8]
                  ">
                    <div
                      class="
                        h-full
                        rounded-full
                      "
                      style="
                        width:${width}%;
                        background:${MODULES[module].color}
                      "
                    ></div>
                  </div>
                </div>
              `;
            }
          )
          .join('');


    $('nextActionTitle')
      .textContent =
        '能力诊断';


    if (
      state
        .profile
        .diagnosed
    ) {
      $('nextActionText')
        .textContent =
          state
            .profile
            .diagnosisCompletedAt
            ? `上次诊断：${formatDateTimeShort(
                state
                  .profile
                  .diagnosisCompletedAt
              )}`
            : '已完成诊断';


      $('nextActionBtn')
        .textContent =
          '重新诊断';

    } else {
      $('nextActionText')
        .textContent =
          '做几道题，看看当前水平。';


      $('nextActionBtn')
        .textContent =
          '开始诊断';
    }


    $('nextActionBtn')
      .dataset
      .target =
        'diagnosis';


    const strategyCards = [
      {
        title:
          state
            .settings
            .difficultyMode ===
          'adaptive'
            ? '自适应难度'
            : '固定难度',

        text:
          state
            .settings
            .difficultyMode ===
          'adaptive'
            ? '根据作答调整后续难度'
            : '按照手动等级出题'
      },

      {
        title:
          trainingModeLabel(),

        text:
          '训练模式'
      },

      {
        title:
          `${state.settings.dailyCount} 题`,

        text:
          '每日题量'
      }
    ];


    $('strategySummary')
      .innerHTML =
        strategyCards
          .map(
            card => `
              <div class="
                rounded-xl
                bg-[#f7f6f2]
                p-4
              ">
                <div class="
                  text-sm
                  font-semibold
                ">
                  ${escapeHTML(
                    card.title
                  )}
                </div>

                <div class="
                  mt-1
                  text-xs
                  leading-5
                  text-muted
                ">
                  ${escapeHTML(
                    card.text
                  )}
                </div>
              </div>
            `
          )
          .join('');


    const weak =
      weakTopics()
        .slice(
          0,
          4
        );


    $('weakTopicList')
      .innerHTML =
        weak.length
          ? weak
              .map(
                item => `
                  <div class="
                    rounded-xl
                    border
                    border-line
                    bg-[#faf9f6]
                    p-4
                  ">
                    <div class="
                      flex
                      items-center
                      justify-between
                      gap-3
                    ">
                      <div>
                        <div class="
                          text-sm
                          font-medium
                        ">
                          ${escapeHTML(
                            item.topic
                          )}
                        </div>

                        <div class="
                          mt-1
                          text-[11px]
                          text-muted
                        ">
                          ${moduleLabel(
                            item.module
                          )}
                          ·
                          ${item.attempts} 次作答
                        </div>
                      </div>

                      <div class="
                        text-sm
                        font-semibold
                      ">
                        ${item.acc}%
                      </div>
                    </div>
                  </div>
                `
              )
              .join('')
          : `
              <div class="
                rounded-xl
                bg-[#f7f6f2]
                p-4
                text-sm
                text-muted
              ">
                完成一些练习后，这里会显示需要关注的考点。
              </div>
            `;


    renderRecentHistory();

    renderDiagnosisSummary();
  }


  function renderDailyPreview() {
    const onboarding =
      $('dailyOnboarding');


    const intro =
      $('dailyIntro');


    const preview =
      $('dailyPlanPreview');


    const offerDiagnosis =
      shouldOfferDiagnosis();


    if (
      onboarding
    ) {
      onboarding
        .classList
        .toggle(
          'hidden',
          !offerDiagnosis
        );
    }


    if (
      intro
    ) {
      intro
        .classList
        .toggle(
          'hidden',
          offerDiagnosis
        );
    }


    if (
      offerDiagnosis ||
      !preview
    ) {
      return;
    }


    const items = [
      `${state.settings.dailyCount} 题`,
      '极限 · 导数 · 积分'
    ];


    const reviewCount =
      dueReviews()
        .length;


    if (
      reviewCount > 0
    ) {
      items.push(
        `${reviewCount} 个考点待复习`
      );
    }


    if (
      state
        .settings
        .difficultyMode ===
      'fixed'
    ) {
      items.push(
        '固定难度'
      );
    }


    preview.innerHTML =
      items
        .map(
          text => `
            <span class="
              rounded-full
              bg-[#f1f0ec]
              px-3
              py-1.5
              text-xs
              text-muted
            ">
              ${escapeHTML(
                text
              )}
            </span>
          `
        )
        .join('');
  }


  function renderReviewIntro() {
    const count =
      dueReviews()
        .length;


    const text =
      $('reviewIntroText');


    const button =
      $('startReviewBtn');


    if (text) {
      text.textContent =
        count > 0
          ? `${count} 个考点待复习`
          : '今天没有待复习的题';
    }


    if (
      button
    ) {
      button.disabled =
        count === 0;


      button.classList.toggle(
        'opacity-50',
        count === 0
      );
    }


    renderReviewQueueList();
  }


  function renderCheckin() {
    if (
      !$('checkinStreak')
    ) {
      return;
    }


    $('checkinStreak')
      .textContent =
        computeStreak();


    const dates =
      Array.from(
        {
          length:
            28
        },

        (
          _,
          i
        ) =>
          dateOffsetISO(
            i - 27
          )
      );


    const set =
      new Set(
        state.checkins
      );


    const count =
      dates.filter(
        d =>
          set.has(d)
      ).length;


    $('monthCheckinCount')
      .textContent =
        `最近 28 天学习 ${count} 天`;


    $('checkinGrid')
      .innerHTML =
        dates
          .map(
            d => {
              const hit =
                set.has(d);


              const date =
                new Date(
                  `${d}T12:00:00`
                );


              return `
                <div
                  title="${d}"
                  class="
                    aspect-square
                    rounded-lg
                    border
                    ${
                      hit
                        ? 'border-sage/20 bg-sage text-white'
                        : 'border-line bg-[#faf9f6] text-muted'
                    }
                    grid
                    place-items-center
                    text-[11px]
                  "
                >
                  ${date.getDate()}
                </div>
              `;
            }
          )
          .join('');
  }


  function renderSettings() {
    if (
      !$('limitLevelRange')
    ) {
      return;
    }


    MODULE_KEYS.forEach(
      module => {
        const range =
          $(
            `${module}LevelRange`
          );


        const value =
          $(
            `${module}LevelValue`
          );


        if (range) {
          range.value =
            state
              .settings
              .manualLevels[
                module
              ];
        }


        if (value) {
          value.textContent =
            `Lv.${
              state
                .settings
                .manualLevels[
                  module
                ]
            }`;
        }
      }
    );


    $$('.setting-mode-card')
      .forEach(
        card => {
          const active =
            card
              .dataset
              .settingMode ===
            state
              .settings
              .difficultyMode;


          card.classList.toggle(
            'border-sage',
            active
          );


          card.classList.toggle(
            'bg-sageSoft',
            active
          );


          const check =
            card.querySelector(
              '.mode-check'
            );


          if (check) {
            check.textContent =
              active
                ? '●'
                : '○';


            check.className =
              `mode-check ${
                active
                  ? 'text-sage'
                  : 'text-muted'
              }`;
          }
        }
      );


    $$('.training-mode-card')
      .forEach(
        card => {
          const active =
            card
              .dataset
              .trainingMode ===
            state
              .settings
              .trainingMode;


          card.classList.toggle(
            'border-sage',
            active
          );


          card.classList.toggle(
            'bg-sageSoft',
            active
          );
        }
      );


    if (
      $('difficultyModelBadge')
    ) {
      $('difficultyModelBadge')
        .textContent =
          state
            .difficultyModel
            .version;
    }


    if (
      $('dailyCountSelect')
    ) {
      $('dailyCountSelect')
        .value =
          String(
            state
              .settings
              .dailyCount
          );
    }
  }


  /*
  =========================================================
  View switching
  =========================================================
  */

  function switchView(
    viewName
  ) {
    currentView =
      VIEW_META[
        viewName
      ]
        ? viewName
        : 'daily';


    $$('.view')
      .forEach(
        el =>
          el
            .classList
            .add(
              'hidden'
            )
      );


    $(
      `view-${currentView}`
    )
      ?.classList
      .remove(
        'hidden'
      );


    $$('.nav-btn')
      .forEach(
        btn => {
          btn
            .classList
            .toggle(
              'active',
              btn
                .dataset
                .viewTarget ===
                currentView
            );
        }
      );


    const meta =
      VIEW_META[
        currentView
      ];


    const eyebrow =
      $('pageEyebrow');


    const title =
      $('pageTitle');


    const subtitle =
      $('pageSubtitle');


    eyebrow
      ?.classList
      .add(
        'hidden'
      );


    subtitle
      ?.classList
      .add(
        'hidden'
      );


    if (
      title
    ) {
      title.textContent =
        currentView ===
          'daily'
          ? greetingText()
          : meta.title;
    }


    if (
      window.innerWidth <
      1024
    ) {
      $('sideNav')
        ?.classList
        .add(
          'hidden'
        );
    }


    if (
      currentView ===
      'dashboard'
    ) {
      renderDashboard();
    }


    if (
      currentView ===
      'diagnosis'
    ) {
      renderDiagnosisSummary();

      prefetchWarmup(
        'diagnosis'
      );
    }


    if (
      currentView ===
      'daily'
    ) {
      renderDailyPreview();


      if (
        !shouldOfferDiagnosis()
      ) {
        prefetchWarmup(
          'daily'
        );
      }
    }


    if (
      currentView ===
      'review'
    ) {
      renderReviewIntro();
    }


    if (
      currentView ===
      'checkin'
    ) {
      renderCheckin();
    }


    if (
      currentView ===
      'settings'
    ) {
      renderSettings();
    }


    const active =
      state.activeSession;


    if (
      active &&
      !active.completed &&
      sessionView(
        active
      ) ===
      currentView
    ) {
      const introId =
        active.mode ===
          'diagnosis'
          ? 'diagnosisIntro'
          : active.mode ===
              'daily'
            ? 'dailyIntro'
            : null;


      if (
        introId
      ) {
        $(introId)
          ?.classList
          .add(
            'hidden'
          );
      }


      if (
        active.mode ===
        'daily'
      ) {
        $('dailyOnboarding')
          ?.classList
          .add(
            'hidden'
          );
      }


      renderActiveSession(
        sessionContainerId(
          active
        )
      );
    }
  }


  function renderAll() {
    renderApiStatus();

    renderSidebarReviewBadge();

    renderDashboard();

    renderDiagnosisSummary();

    renderDailyPreview();

    renderReviewIntro();

    renderCheckin();

    renderSettings();
  }


  /*
  =========================================================
  Settings
  =========================================================
  */

  const DIFFICULTY_PRESETS = {
    foundation: {
      limit: 3,
      derivative: 3,
      integral: 3
    },

    exam: {
      limit: 6,
      derivative: 6,
      integral: 6
    },

    intensive: {
      limit: 8,
      derivative: 8,
      integral: 8
    },

    hard: {
      limit: 9,
      derivative: 9,
      integral: 9
    },

    competition: {
      limit: 11,
      derivative: 11,
      integral: 11
    }
  };


  function syncManualRangeLabels() {
    MODULE_KEYS.forEach(
      module => {
        const range =
          $(
            `${module}LevelRange`
          );


        const value =
          $(
            `${module}LevelValue`
          );


        if (
          range &&
          value
        ) {
          value.textContent =
            `Lv.${range.value}`;
        }
      }
    );
  }


  function saveManualLevelsFromUI() {
    MODULE_KEYS.forEach(
      module => {
        const range =
          $(
            `${module}LevelRange`
          );


        if (range) {
          state
            .settings
            .manualLevels[
              module
            ] =
              clamp(
                Number(
                  range.value
                ) ||
                6,

                1,
                12
              );
        }
      }
    );


    if (
      $('dailyCountSelect')
    ) {
      state
        .settings
        .dailyCount =
          clamp(
            Number(
              $('dailyCountSelect')
                .value
            ) ||
            10,

            8,
            12
          );
    }
  }


  function applyManualAsAdaptiveStart() {
    saveManualLevelsFromUI();


    state
      .settings
      .difficultyMode =
        'adaptive';


    state
      .profile
      .placementSource =
        'manual-adaptive-start';


    state
      .profile
      .diagnosed =
        false;


    MODULE_KEYS.forEach(
      module => {
        const level =
          state
            .settings
            .manualLevels[
              module
            ];


        state
          .profile
          .abilityByModule[
            module
          ] =
            level;


        state
          .profile
          .displayLevelByModule[
            module
          ] =
            level;


        state
          .profile
          .confidenceByModule[
            module
          ] =
            0.3;


        state
          .profile
          .effectiveAttemptsByModule[
            module
          ] =
            0;
      }
    );


    saveState();

    renderAll();

    toast(
      '已设置自适应起点'
    );
  }


  /*
  =========================================================
  Events
  =========================================================
  */

  function bindEvents() {
    document
      .addEventListener(
        'click',
        event => {
          const target =
            event.target.closest(
              '[data-view-target]'
            );


          if (target) {
            switchView(
              target
                .dataset
                .viewTarget
            );
          }
        }
      );


    $('mobileMenuBtn')
      ?.addEventListener(
        'click',
        () => {
          $('sideNav')
            ?.classList
            .toggle(
              'hidden'
            );
        }
      );


    $('startDiagnosisBtn')
      ?.addEventListener(
        'click',
        startDiagnosis
      );


    $('startDiagnosisFromDailyBtn')
      ?.addEventListener(
        'click',
        async () => {
          switchView(
            'diagnosis'
          );


          await startDiagnosis();
        }
      );


    $('skipDiagnosisBtn')
      ?.addEventListener(
        'click',
        skipDiagnosis
      );


    $('startDailyBtn')
      ?.addEventListener(
        'click',
        startDaily
      );


    $('startReviewBtn')
      ?.addEventListener(
        'click',
        startReview
      );


    $('nextActionBtn')
      ?.addEventListener(
        'click',
        () => {
          switchView(
            $('nextActionBtn')
              ?.dataset
              .target ||
            'diagnosis'
          );
        }
      );


    $$('.setting-mode-card')
      .forEach(
        card => {
          card
            .addEventListener(
              'click',
              () => {
                state
                  .settings
                  .difficultyMode =
                    card
                      .dataset
                      .settingMode;


                saveManualLevelsFromUI();

                saveState();

                renderAll();


                toast(
                  state
                    .settings
                    .difficultyMode ===
                    'adaptive'
                    ? '已开启自适应难度'
                    : '已切换为固定难度'
                );
              }
            );
        }
      );


    MODULE_KEYS.forEach(
      module => {
        $(
          `${module}LevelRange`
        )
          ?.addEventListener(
            'input',
            syncManualRangeLabels
          );
      }
    );


    $$('.difficulty-preset')
      .forEach(
        btn => {
          btn
            .addEventListener(
              'click',
              () => {
                const preset =
                  DIFFICULTY_PRESETS[
                    btn
                      .dataset
                      .preset
                  ];


                if (!preset) {
                  return;
                }


                MODULE_KEYS.forEach(
                  module => {
                    const range =
                      $(
                        `${module}LevelRange`
                      );


                    if (range) {
                      range.value =
                        preset[
                          module
                        ];
                    }
                  }
                );


                syncManualRangeLabels();
              }
            );
        }
      );


    $('applyAsAdaptiveStartBtn')
      ?.addEventListener(
        'click',
        applyManualAsAdaptiveStart
      );


    $('saveDifficultyBtn')
      ?.addEventListener(
        'click',
        () => {
          saveManualLevelsFromUI();

          saveState();

          renderAll();

          toast(
            '设置已保存'
          );
        }
      );


    $$('.training-mode-card')
      .forEach(
        card => {
          card
            .addEventListener(
              'click',
              () => {
                state
                  .settings
                  .trainingMode =
                    card
                      .dataset
                      .trainingMode;


                saveState();

                renderSettings();

                renderDailyPreview();

                renderDashboard();


                toast(
                  `训练模式：${trainingModeLabel()}`
                );
              }
            );
        }
      );


    $('dailyCountSelect')
      ?.addEventListener(
        'change',
        () => {
          state
            .settings
            .dailyCount =
              clamp(
                Number(
                  $('dailyCountSelect')
                    .value
                ) ||
                10,

                8,
                12
              );


          saveState();

          renderDailyPreview();

          renderDashboard();
        }
      );


    $('resetDataBtn')
      ?.addEventListener(
        'click',
        async () => {
          const loggedIn =
            Boolean(
              window
                .CalcDailyCloud
                ?.getUser?.()
            );


          const message =
            loggedIn
              ? '确定清空当前账号的全部学习记录吗？这会同时清空本机与云端学习数据，且无法撤销。'
              : '确定清空本浏览器中的全部学习记录吗？这个操作无法撤销。';


          if (
            !confirm(
              message
            )
          ) {
            return;
          }


          if (
            loggedIn
          ) {
            try {
              await window
                .CalcDailyCloud
                ?.resetRemote?.();

            } catch (error) {
              console.warn(
                '云端重置失败',
                error
              );


              toast(
                '云端重置失败，未清空本地数据'
              );


              return;
            }
          }


          localStorage.removeItem(
            STORAGE_KEY
          );


          state =
            deepClone(
              DEFAULT_STATE
            );


          saveState({
            skipCloud:
              loggedIn
          });


          toast(
            loggedIn
              ? '学习数据已重置'
              : '本地数据已重置'
          );


          renderAll();

          switchView(
            'daily'
          );
        }
      );
  }


  /*
  =========================================================
  Init
  =========================================================
  */

  function init() {
    if (
      $('todayLabel')
    ) {
      $('todayLabel')
        .textContent =
          formatDateCN();
    }


    window.addEventListener(
      'calcdaily:cloud-state-ready',
      event => {
        const cloudState =
          event.detail
            ?.state;


        if (
          cloudState
        ) {
          applyCloudState(
            cloudState
          );
        }
      }
    );


    bindEvents();

    renderAll();

    switchView(
      'daily'
    );

    checkApiHealth();


    const pendingCloudState =
      window
        .CalcDailyCloud
        ?.consumePendingState?.();


    if (
      pendingCloudState
    ) {
      applyCloudState(
        pendingCloudState
      );
    }
  }


  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init
    );

  } else {
    init();
  }
})();