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

  const difficultyEvaluationTasks =
    new Map();


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


  async function apiCall(
    action,
    payload = {}
  ) {
    const response =
      await fetch(
        AI_API_URL,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              action,
              ...payload
            })
        }
      );


    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    if (
      !response.ok
    ) {
      throw new Error(
        data.error ||
        `AI 请求失败 (${response.status})`
      );
    }


    return data;
  }


  async function checkApiHealth() {
    try {
      const res =
        await fetch(
          `${AI_API_URL}?health=1`,
          {
            cache:
              'no-store'
          }
        );

      apiHealthy =
        res.ok;

    } catch {
      apiHealthy =
        false;
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
      text.textContent =
        'DeepSeek 已连接';

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


  async function judgeAnswer(
    question,
    userAnswer
  ) {
    if (
      !String(
        userAnswer ||
        ''
      ).trim()
    ) {
      return {
        correct: false,
        feedback:
          '答案不能为空。'
      };
    }


    if (
      locallyEquivalent(
        userAnswer,
        question.answer
      )
    ) {
      return {
        correct: true,

        feedback:
          '与参考答案数学等价。'
      };
    }


    try {
      const result =
        await apiCall(
          'judge',
          {
            question,
            userAnswer
          }
        );


      markApiRequestSuccess();


      if (
        typeof
          result.correct ===
        'boolean'
      ) {
        return {
          correct:
            result.correct,

          feedback:
            String(
              result.feedback ||
              ''
            )
        };
      }


      throw new Error(
        'AI 判题返回格式异常'
      );

    } catch (error) {
      console.warn(
        error
      );

      markApiRequestFailure(
        error
      );


      return {
        correct: null,

        needsManualCheck:
          true,

        feedback:
          `当前无法自动确认。参考答案：${question.answer}`
      };
    }
  }


  /*
  =========================================================
  Fallback bank
  =========================================================
  */

  const FALLBACK_BANK = [
    {
      module:
        'limit',

      topic:
        '重要极限',

      difficulty:
        2,

      instruction:
        '计算极限',

      expression:
        '\\lim_{x\\to0}\\frac{\\sin 3x}{x}',

      answer:
        '3',

      solution:
        '利用 \\(\\sin u\\sim u\\)，所以 \\(\\sin 3x\\sim 3x\\)，极限为 \\(3\\)。'
    },

    {
      module:
        'limit',

      topic:
        '等价无穷小',

      difficulty:
        4,

      instruction:
        '计算极限',

      expression:
        '\\lim_{x\\to0}\\frac{1-\\cos x}{x^2}',

      answer:
        '1/2',

      solution:
        '利用 \\(1-\\cos x=2\\sin^2(x/2)\\)，得到 \\(\\frac12\\)。'
    },

    {
      module:
        'limit',

      topic:
        '泰勒展开',

      difficulty:
        6,

      instruction:
        '计算极限',

      expression:
        '\\lim_{x\\to0}\\frac{e^x-1-x-\\frac{x^2}{2}}{x^3}',

      answer:
        '1/6',

      solution:
        '使用 \\(e^x=1+x+\\frac{x^2}{2}+\\frac{x^3}{6}+o(x^3)\\)。'
    },

    {
      module:
        'limit',

      topic:
        '复合极限',

      difficulty:
        8,

      instruction:
        '计算极限',

      expression:
        '\\lim_{x\\to0}\\frac{\\ln(1+\\sin x)-x+\\frac{x^2}{2}}{x^3}',

      answer:
        '-1/6',

      solution:
        '对 \\(\\sin x\\) 与 \\(\\ln(1+u)\\) 分层展开并保留到三阶。'
    },

    {
      module:
        'derivative',

      topic:
        '复合函数求导',

      difficulty:
        2,

      instruction:
        '求导',

      expression:
        'y=\\ln(1+x^2)',

      answer:
        '2x/(1+x^2)',

      solution:
        '链式法则得到 \\(y\'=\\frac{2x}{1+x^2}\\)。'
    },

    {
      module:
        'derivative',

      topic:
        '乘积法则',

      difficulty:
        4,

      instruction:
        '求导',

      expression:
        'y=x^2e^x',

      answer:
        'e^x(x^2+2x)',

      solution:
        '乘积法则：\\(y\'=2xe^x+x^2e^x=e^x(x^2+2x)\\)。'
    },

    {
      module:
        'derivative',

      topic:
        '隐函数求导',

      difficulty:
        6,

      instruction:
        '已知曲线，求 \\(dy/dx\\)',

      expression:
        'x^2+xy+y^2=1',

      answer:
        '-(2x+y)/(x+2y)',

      solution:
        '两边对 \\(x\\) 求导并整理 \\(y\'\\) 项。'
    },

    {
      module:
        'derivative',

      topic:
        '高阶导数',

      difficulty:
        8,

      instruction:
        '求二阶导数',

      expression:
        'y=e^x\\sin x',

      answer:
        '2e^x cos x',

      solution:
        '先求 \\(y\'=e^x(\\sin x+\\cos x)\\)，再求一次导数。'
    },

    {
      module:
        'integral',

      topic:
        '基本积分',

      difficulty:
        2,

      instruction:
        '计算不定积分',

      expression:
        '\\int(3x^2+2x)\\,dx',

      answer:
        'x^3+x^2+C',

      solution:
        '逐项积分得到 \\(x^3+x^2+C\\)。'
    },

    {
      module:
        'integral',

      topic:
        '换元积分',

      difficulty:
        4,

      instruction:
        '计算不定积分',

      expression:
        '\\int 2x\\cos(x^2)\\,dx',

      answer:
        'sin(x^2)+C',

      solution:
        '令 \\(u=x^2\\)，则 \\(du=2x\\,dx\\)。'
    },

    {
      module:
        'integral',

      topic:
        '分部积分',

      difficulty:
        6,

      instruction:
        '计算不定积分',

      expression:
        '\\int x^2e^x\\,dx',

      answer:
        'e^x(x^2-2x+2)+C',

      solution:
        '连续两次分部积分即可。'
    },

    {
      module:
        'integral',

      topic:
        '定积分技巧',

      difficulty:
        8,

      instruction:
        '计算定积分',

      expression:
        '\\int_0^1\\frac{\\ln(1+x)}{1+x}\\,dx',

      answer:
        '(ln2)^2/2',

      solution:
        '令 \\(u=\\ln(1+x)\\)，积分化为 \\(\\int_0^{\\ln2}u\\,du\\)。'
    }
  ];


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


    const candidates =
      FALLBACK_BANK
        .filter(
          q =>
            q.module ===
            module
        )
        .sort(
          (
            a,
            b
          ) =>
            Math.abs(
              a.difficulty -
              target
            ) -
            Math.abs(
              b.difficulty -
              target
            )
        );


    const base =
      candidates[0] ||
      FALLBACK_BANK[0];


    const provisionalDifficulty =
      Number(
        base.difficulty
      );


    return {
      ...base,

      id:
        uid(
          'fallback'
        ),

      source:
        'fallback',

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
    };
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
    plan
  ) {
    try {
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
              )
          }
        );


      if (
        !Array.isArray(
          data.questions
        ) ||
        !data.questions.length
      ) {
        throw new Error(
          'AI 返回题目为空'
        );
      }


      markApiRequestSuccess();


      const q =
        data.questions[0];


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
        id:
          q.id ||
          uid('ai'),

        module:
          MODULE_KEYS.includes(
            q.module
          )
            ? q.module
            : plan.module,

        topic:
          q.topic ||
          plan.topic ||
          '综合基础',

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
          q.answer ||
          '',

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


      toast(
        `AI 本次出题失败，已使用备用题：${shortApiError(error)}`
      );


      return fallbackQuestion(
        plan
      );
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


    const signature =
      `${session.results.length}:` +
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


    const promise =
      generateOneQuestion(
        plan
      )
        .then(
          question => ({
            question,
            plan
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
      {
        signature,

        resultCount:
          session
            .results
            .length,

        promise
      }
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


    const signature =
      `${shadow.results.length}:` +
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


    const promise =
      generateOneQuestion(
        plan
      )
        .then(
          nextQuestion => ({
            question:
              nextQuestion,

            plan
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
      {
        signature,

        resultCount:
          shadow
            .results
            .length,

        promise
      }
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
    const cached =
      sessionPrefetch.get(
        session?.id
      );


    if (!cached) {
      return null;
    }


    sessionPrefetch.delete(
      session.id
    );


    if (
      cached.resultCount !==
      session
        .results
        .length
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


    if (
      expectedPlan &&
      !plansCompatible(
        value.plan,
        expectedPlan
      )
    ) {
      return null;
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


    warmupPrefetch[
      mode
    ] = {
      fingerprint,
      plan,

      promise:
        generateOneQuestion(
          plan
        )
          .then(
            question => ({
              question,
              plan
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

        module:
          question.module,

        topic:
          question.topic ||
          '综合基础',

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

        solution:
          question.solution,

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


    item.instruction =
      question
        .instruction ||
      item.instruction;


    item.expression =
      question
        .expression ||
      item.expression;


    item.prompt =
      question.prompt ||
      item.prompt;


    item.answer =
      question.answer ||
      item.answer;


    item.solution =
      question.solution ||
      item.solution;


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
        userAnswer
      );


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