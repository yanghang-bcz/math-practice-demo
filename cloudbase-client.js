(() => {
  'use strict';

  // =========================================================
  // CalcDaily · CloudBase Client
  // =========================================================

  // 把你当前 cloudbase-client.js 里的 Publishable Key 原样粘到这里。
  // 只能使用 Publishable Key，不要填写 Secret Key / 服务端 API Key。
  const PUBLISHABLE_KEY =
    'eyJhbGciOiJSUzI1NiIsImtpZCI6Ijg5YzQ3NWY5LTE0NzMtNDhmMy1hZDEzLTM4MzkxMDc0ZDFhNyJ9.eyJpc3MiOiJodHRwczovL2NhbGNkYWlseS1kNWcydGl0d3VlOTE1NTFmYi5hcC1zaGFuZ2hhaS50Y2ItYXBpLnRlbmNlbnRjbG91ZGFwaS5jb20iLCJzdWIiOiJhbm9uIiwiYXVkIjoiY2FsY2RhaWx5LWQ1ZzJ0aXR3dWU5MTU1MWZiIiwiZXhwIjo0MDkyNDQ0NDMxLCJpYXQiOjE3ODg3NjEyMzEsIm5vbmNlIjoiRExmdjh3RmVTQ3VfWmZKV0pBclZTQSIsImF0X2hhc2giOiJETGZ2OHdGZVNDdV9aZkpXSkFyVlNBIiwibmFtZSI6IkFub255bW91cyIsInNjb3BlIjoiYW5vbnltb3VzIiwicHJvamVjdF9pZCI6ImNhbGNkYWlseS1kNWcydGl0d3VlOTE1NTFmYiIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJyb2xlIjoiYW5vbiIsImlzX2Fub255bW91cyI6dHJ1ZSwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiYW5vbnltb3VzIiwicHJvdmlkZXJzIjpbImFub255bW91cyJdfSwidXNlcl9tZXRhZGF0YSI6eyJuYW1lIjoiQW5vbnltb3VzIn0sInVzZXJfdHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3VzZXIiLCJpc19zeXN0ZW1fYWRtaW4iOmZhbHNlfQ.yuYbWmprQa5MT4Y5OFnRxVUYgAMRAMXqMDUz6gVlsppJ__igp71AIZ5uFciGpyJAdiGVZFAPoV5W73UPOgXN6g7Lvuxq3VVjUcyUbiRGb9qoufsqIi480-ygPGl70HDgPn0VCwl1SjmomlxXptEJCrcXIvI6eq1io7bJ5ukqTEueUYKx7idtjXj9Uf1exONs38O3vS4dVG9jVldSKoiG2i1J8F0lzAJtrTzaGuqM4TEfC_rtGe02Vtc7DDtu6Huo7JngpCu4kFzfRvCU_u8exkox7fKkNCpW8D21vTRIyCe9U4AIsI44sRDvACFMKLIJbrJTZKcM2V7oPecrUrKgbg';

  const ENV_ID =
    'calcdaily-d5g2titwue91551fb';

  const REGION =
    'ap-shanghai';

  // CloudBase HTTP 网关上的 DeepSeek API。
  const AI_API_URL =
    'https://calcdaily-d5g2titwue91551fb-1482769901.ap-shanghai.app.tcloudbase.com/api/deepseek';


  // =========================================================
  // AI API bridge
  // ---------------------------------------------------------
  // app.js 原来仍然请求：
  //   /api/deepseek
  //
  // 为了不碰已经稳定运行的 app.js，
  // 在这里把这些请求透明重写到 CloudBase HTTP 网关。
  // =========================================================

  const originalFetch =
    window.fetch.bind(window);

  window.fetch = function calcDailyFetchBridge(
    input,
    init
  ) {
    if (typeof input === 'string') {
      if (input === '/api/deepseek') {
        return originalFetch(
          AI_API_URL,
          init
        );
      }

      if (
        input.startsWith(
          '/api/deepseek?'
        )
      ) {
        return originalFetch(
          AI_API_URL +
            input.slice(
              '/api/deepseek'.length
            ),
          init
        );
      }
    }

    return originalFetch(
      input,
      init
    );
  };


  // =========================================================
  // CloudBase config
  // =========================================================

  const configured = Boolean(
    PUBLISHABLE_KEY.trim() &&
    !PUBLISHABLE_KEY.startsWith(
      '把你'
    ) &&
    !PUBLISHABLE_KEY.startsWith(
      'YOUR_'
    ) &&
    window.cloudbase?.init
  );


  // =========================================================
  // User normalization
  // =========================================================

  function normalizeUser(user) {
    if (!user) {
      return null;
    }

    if (
      user.is_anonymous ||
      user.isAnonymous ||
      user.role === 'anon'
    ) {
      return null;
    }

    const id =
      user.id ||
      user.uid ||
      user.sub ||
      user.user_metadata?.uid;

    if (!id) {
      return null;
    }

    const email =
      user.email ||
      user.email_address ||
      user.user_metadata?.email ||
      '';

    const displayName =
      user.nickname ||
      user.nickName ||
      user.name ||
      user.user_metadata?.nickName ||
      user.user_metadata?.nickname ||
      user.user_metadata?.name ||
      user.user_metadata?.display_name ||
      '';

    return {
      ...user,

      id: String(id),

      email,

      user_metadata: {
        ...(user.user_metadata || {}),

        display_name:
          displayName
      }
    };
  }


  function normalizeSession(session) {
    if (!session) {
      return null;
    }

    const user =
      normalizeUser(session.user);

    if (!user) {
      return null;
    }

    return {
      ...session,
      user
    };
  }


  // =========================================================
  // Initialization
  // =========================================================

  let client = null;
  let initializationError = null;

  if (configured) {
    try {
      const app =
        window.cloudbase.init({
          env: ENV_ID,
          region: REGION,
          accessKey:
            PUBLISHABLE_KEY
        });

      const auth = app.auth;
      const db = app.rdb();


      // =====================================================
      // Auth wrapper
      // =====================================================

      const authClient = {
        signInWithPassword(params) {
          return auth
            .signInWithPassword(
              params
            );
        },


        signOut() {
          return auth.signOut();
        },


        async getSession() {
          const result =
            await auth.getSession();

          return {
            ...result,

            data: {
              ...(result.data || {}),

              session:
                normalizeSession(
                  result.data?.session
                )
            }
          };
        },


        onAuthStateChange(
          callback
        ) {
          return auth
            .onAuthStateChange(
              (
                event,
                session
              ) => {
                callback(
                  event,
                  normalizeSession(
                    session
                  )
                );
              }
            );
        },


        async updateUser({
          data
        }) {
          const displayName =
            String(
              data?.display_name ||
              ''
            ).trim();

          const result =
            await auth.updateUser({
              nickname:
                displayName
            });

          return {
            ...result,

            data: {
              ...(result.data || {}),

              user:
                normalizeUser(
                  result.data?.user
                )
            }
          };
        },


        // ===================================================
        // Registration Step 1
        // ---------------------------------------------------
        // CloudBase v3 官方流程：
        //
        // auth.signUp({
        //   email,
        //   password
        // })
        //
        // 会发送邮箱验证码，
        // 返回 data.verifyOtp 回调。
        // ===================================================

        async sendRegistrationCode(
          email,
          password,
          nickname
        ) {
          const cleanEmail =
            String(email || '')
              .trim();

          const cleanNickname =
            String(
              nickname || ''
            ).trim();

          const cleanPassword =
            String(
              password || ''
            );

          if (!cleanEmail) {
            throw new Error(
              '请输入邮箱。'
            );
          }

          if (!cleanNickname) {
            throw new Error(
              '请输入昵称。'
            );
          }

          if (
            cleanPassword.length <
              8 ||
            cleanPassword.length >
              32
          ) {
            throw new Error(
              '密码需要 8–32 位。'
            );
          }

          if (
            !/[A-Za-z]/.test(
              cleanPassword
            ) ||
            !/\d/.test(
              cleanPassword
            )
          ) {
            throw new Error(
              '密码至少需要包含字母和数字。'
            );
          }

          const result =
            await auth.signUp({
              email:
                cleanEmail,

              password:
                cleanPassword
            });

          if (result?.error) {
            throw result.error;
          }

          const verifyOtp =
            result?.data
              ?.verifyOtp;

          if (
            typeof verifyOtp !==
            'function'
          ) {
            throw new Error(
              'CloudBase 未返回验证码验证流程。'
            );
          }

          return {
            email:
              cleanEmail,

            password:
              cleanPassword,

            nickname:
              cleanNickname,

            verifyOtp
          };
        },


        // ===================================================
        // Registration Step 2
        // ===================================================

        async completeRegistration(
          info,
          token,
          password,
          nickname
        ) {
          if (
            !info ||
            typeof info.verifyOtp !==
              'function'
          ) {
            throw new Error(
              '注册验证已失效，请重新发送验证码。'
            );
          }

          const currentPassword =
            String(password || '');

          const currentNickname =
            String(
              nickname || ''
            ).trim();

          // 用户发完验证码后如果又改了密码，
          // 必须重新发码，避免 UI 和真实账号密码不一致。
          if (
            currentPassword !==
            info.password
          ) {
            throw new Error(
              '密码已修改，请重新发送验证码。'
            );
          }

          if (
            currentNickname !==
            info.nickname
          ) {
            throw new Error(
              '昵称已修改，请重新发送验证码。'
            );
          }

          const cleanToken =
            String(token || '')
              .trim();

          if (!cleanToken) {
            throw new Error(
              '请输入邮箱验证码。'
            );
          }

          const verifyResult =
            await info.verifyOtp({
              token:
                cleanToken
            });

          if (
            verifyResult?.error
          ) {
            throw verifyResult.error;
          }

          // 验证成功后用户已经登录，
          // 再写入昵称。
          if (currentNickname) {
            const nicknameResult =
              await auth.updateUser({
                nickname:
                  currentNickname
              });

            if (
              nicknameResult
                ?.error
            ) {
              throw nicknameResult
                .error;
            }
          }

          // 重新读取标准 Session，
          // 避免不同 SDK 返回结构造成兼容问题。
          return await authClient
            .getSession();
        }
      };


      // =====================================================
      // Supabase-like adapter
      // -----------------------------------------------------
      // storage.js 保持完全不动。
      // =====================================================

      client = {
        from(table) {
          return db.from(table);
        },

        auth:
          authClient
      };

    } catch (error) {
      initializationError =
        error;

      console.warn(
        'CloudBase 初始化失败',
        error
      );
    }
  }


  // =========================================================
  // Global export
  // =========================================================

  window.CalcDailyCloudBase = {
    configured:
      configured &&
      Boolean(client),

    client,

    normalizeUser,

    env:
      ENV_ID,

    region:
      REGION,

    aiApiUrl:
      AI_API_URL,

    initializationError
  };
})();