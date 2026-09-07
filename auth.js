(() => {
  'use strict';

  let authMode = 'login';

  let registrationInfo = null;

  let codeBusy = false;
  let resendAfter = 0;
  let codeTimer = null;

  let sessionGeneration = 0;

  let currentSessionUserId =
    null;

  let authBusy = false;

  let nicknameBusy = false;

  let syncStatus = 'idle';
  let syncMessage = '';

  const $ =
    id =>
      document.getElementById(
        id
      );


  // =========================================================
  // Client
  // =========================================================

  function client() {
    return (
      window
        .CalcDailyCloudBase
        ?.client ||
      null
    );
  }


  function configured() {
    return Boolean(
      window
        .CalcDailyCloudBase
        ?.configured &&
      client()
    );
  }


  // =========================================================
  // UI helpers
  // =========================================================

  function show(
    element,
    visible
  ) {
    if (!element) return;

    element.classList
      .toggle(
        'hidden',
        !visible
      );
  }


  function openModal() {
    const modal =
      $('accountModal');

    if (!modal) return;

    modal.classList
      .remove('hidden');

    modal.classList
      .add('flex');
  }


  function closeModal() {
    const modal =
      $('accountModal');

    if (!modal) return;

    modal.classList
      .add('hidden');

    modal.classList
      .remove('flex');
  }


  function setMessage(
    message,
    type = 'neutral'
  ) {
    const el =
      $('authMessage');

    if (!el) return;

    if (!message) {
      el.textContent = '';

      el.classList
        .add('hidden');

      return;
    }

    el.textContent =
      message;

    el.classList
      .remove('hidden');

    el.className =
      'rounded-xl px-3.5 py-3 text-xs leading-5 ' +
      (
        type === 'error'
          ? 'bg-[#fff0ea] text-clay'
          : type ===
              'success'
            ? 'bg-sageSoft text-sage'
            : 'bg-[#efede8] text-muted'
      );
  }


  function setProfileMessage(
    message,
    type = 'neutral'
  ) {
    const el =
      $('profileMessage');

    if (!el) return;

    if (!message) {
      el.textContent = '';

      el.classList
        .add('hidden');

      return;
    }

    el.textContent =
      message;

    el.classList
      .remove('hidden');

    el.className =
      'mt-3 rounded-xl px-3.5 py-3 text-xs leading-5 ' +
      (
        type === 'error'
          ? 'bg-[#fff0ea] text-clay'
          : type ===
              'success'
            ? 'bg-sageSoft text-sage'
            : 'bg-[#efede8] text-muted'
      );
  }


  // =========================================================
  // Display name
  // =========================================================

  function displayNameFor(
    user
  ) {
    const metadataName =
      String(
        user
          ?.user_metadata
          ?.display_name ||
        ''
      ).trim();

    if (metadataName) {
      return metadataName;
    }

    return (
      String(
        user?.email ||
        ''
      ).split('@')[0] ||
      'CalcDaily User'
    );
  }


  // =========================================================
  // Login / register mode
  // =========================================================

  function setMode(mode) {
    if (
      authBusy ||
      codeBusy
    ) {
      return;
    }

    authMode =
      mode === 'register'
        ? 'register'
        : 'login';

    registrationInfo =
      null;

    const loginTab =
      $('authLoginTab');

    const registerTab =
      $('authRegisterTab');

    const submit =
      $('authSubmitBtn');

    const password =
      $('authPasswordInput');

    const nicknameField =
      $('authNicknameField');

    const nickname =
      $('authNicknameInput');


    if (loginTab) {
      loginTab.className =
        'rounded-lg px-3 py-2 text-xs font-medium ' +
        (
          authMode ===
            'login'
            ? 'bg-white shadow-sm'
            : 'text-muted'
        );
    }


    if (registerTab) {
      registerTab.className =
        'rounded-lg px-3 py-2 text-xs font-medium ' +
        (
          authMode ===
            'register'
            ? 'bg-white shadow-sm'
            : 'text-muted'
        );
    }


    if (submit) {
      submit.textContent =
        authMode ===
          'login'
          ? '登录'
          : '创建账号';
    }


    if (password) {
      password.autocomplete =
        authMode ===
          'login'
          ? 'current-password'
          : 'new-password';
    }


    show(
      nicknameField,
      authMode ===
        'register'
    );


    if (nickname) {
      nickname.required =
        authMode ===
        'register';

      if (
        authMode ===
        'login'
      ) {
        nickname.value = '';
      }
    }


    show(
      $('authCodeField'),
      authMode ===
        'register'
    );


    if (
      $('authCodeInput')
    ) {
      $('authCodeInput')
        .required =
          authMode ===
          'register';

      $('authCodeInput')
        .disabled =
          authMode !==
          'register';
    }

    setMessage('');
    refreshCodeButton();
  }


  // =========================================================
  // Verification code
  // =========================================================

  function refreshCodeButton() {
    const button =
      $('authSendCodeBtn');

    if (!button) return;

    const remaining =
      Math.max(
        0,
        Math.ceil(
          (
            resendAfter -
            Date.now()
          ) / 1000
        )
      );

    button.disabled =
      codeBusy ||
      authBusy ||
      remaining > 0 ||
      !configured();

    button.textContent =
      codeBusy
        ? '发送中…'
        : remaining
          ? `${remaining} 秒后重发`
          : '发送邮箱验证码';

    if (
      !remaining &&
      codeTimer
    ) {
      clearInterval(
        codeTimer
      );

      codeTimer = null;
    }
  }


  function validateRegisterFields() {
    const emailInput =
      $('authEmailInput');

    const passwordInput =
      $('authPasswordInput');

    const nicknameInput =
      $('authNicknameInput');

    if (
      !emailInput
        ?.reportValidity()
    ) {
      return null;
    }

    const email =
      String(
        emailInput.value ||
        ''
      ).trim();

    const password =
      String(
        passwordInput
          ?.value ||
        ''
      );

    const nickname =
      String(
        nicknameInput
          ?.value ||
        ''
      ).trim();


    if (!nickname) {
      setMessage(
        '请先填写昵称。',
        'error'
      );

      return null;
    }


    if (
      nickname.length > 20
    ) {
      setMessage(
        '昵称不能超过 20 个字符。',
        'error'
      );

      return null;
    }


    if (
      password.length < 8 ||
      password.length > 32
    ) {
      setMessage(
        '密码需要 8–32 位。',
        'error'
      );

      return null;
    }


    if (
      !/[A-Za-z]/.test(
        password
      ) ||
      !/\d/.test(
        password
      )
    ) {
      setMessage(
        '密码至少需要包含字母和数字。',
        'error'
      );

      return null;
    }

    return {
      email,
      password,
      nickname
    };
  }


  async function sendRegistrationCode() {
    if (
      !configured() ||
      codeBusy ||
      authBusy ||
      Date.now() <
        resendAfter
    ) {
      return;
    }


    const fields =
      validateRegisterFields();

    if (!fields) {
      return;
    }


    codeBusy = true;

    registrationInfo =
      null;

    refreshCodeButton();


    try {
      const info =
        await client()
          .auth
          .sendRegistrationCode(
            fields.email,
            fields.password,
            fields.nickname
          );


      if (
        fields.email !==
        String(
          $('authEmailInput')
            ?.value ||
          ''
        ).trim()
      ) {
        throw new Error(
          '邮箱已更改，请重新发送验证码。'
        );
      }


      registrationInfo =
        info;

      resendAfter =
        Date.now() +
        60000;

      codeTimer =
        setInterval(
          refreshCodeButton,
          1000
        );


      setMessage(
        '验证码已发送。请查看邮箱，填写验证码后点击“创建账号”。',
        'success'
      );

    } catch (error) {
      console.warn(
        '发送邮箱验证码失败',
        error
      );

      setMessage(
        error?.message ||
        '验证码发送失败，请稍后重试。',
        'error'
      );

    } finally {
      codeBusy = false;

      refreshCodeButton();
    }
  }


  // =========================================================
  // Current user / sync labels
  // =========================================================

  function currentUser() {
    return (
      window
        .CalcDailyCloud
        ?.getUser?.() ||
      null
    );
  }


  function syncLabel() {
    if (
      syncStatus ===
        'syncing' ||
      syncStatus ===
        'loading'
    ) {
      return (
        syncMessage ||
        '正在同步…'
      );
    }


    if (
      syncStatus ===
      'error'
    ) {
      return syncMessage
        ? `同步失败：${syncMessage}`
        : '云端同步失败';
    }


    if (
      syncStatus ===
      'synced'
    ) {
      return (
        syncMessage ||
        '云端已同步'
      );
    }


    return '登录后自动同步学习记录';
  }


  // =========================================================
  // Account UI
  // =========================================================

  function renderAccountUI() {
    const user =
      currentUser();

    const isConfigured =
      configured();

    const title =
      $('accountStatusTitle');

    const text =
      $('accountStatusText');

    const dot =
      $('accountStatusDot');

    const action =
      $('accountActionBtn');

    const mobile =
      $('mobileAccountBtn');

    const reset =
      $('resetDataBtn');


    show(
      $('authConfigNotice'),
      !isConfigured
    );

    show(
      $('signedOutPanel'),
      !user
    );

    show(
      $('signedInPanel'),
      Boolean(user)
    );


    if (reset) {
      reset.textContent =
        user
          ? '清空学习数据'
          : '重置本地数据';

      reset.title =
        user
          ? '清空当前账号的本机与云端学习记录，不删除账号'
          : '清空当前浏览器中的本地学习记录';
    }


    if (!isConfigured) {
      if (title) {
        title.textContent =
          '云同步未配置';
      }

      if (text) {
        text.textContent =
          '填写 CloudBase 项目配置后启用';
      }

      if (dot) {
        dot.className =
          'h-2 w-2 shrink-0 rounded-full bg-amber-400';
      }

      if (action) {
        action.textContent =
          '配置';
      }

      if (mobile) {
        mobile.textContent =
          '账号';
      }

      return;
    }


    if (!user) {
      if (title) {
        title.textContent =
          '游客模式';
      }

      if (text) {
        text.textContent =
          '登录后可跨设备同步学习记录';
      }

      if (dot) {
        dot.className =
          'h-2 w-2 shrink-0 rounded-full bg-[#c9c3ba]';
      }

      if (action) {
        action.textContent =
          '登录';
      }

      if (mobile) {
        mobile.textContent =
          '登录';
      }

      return;
    }


    const email =
      user.email ||
      '已登录';

    const displayName =
      displayNameFor(
        user
      );


    if (title) {
      title.textContent =
        displayName;
    }

    if (text) {
      text.textContent =
        syncLabel();
    }


    if (dot) {
      dot.className =
        'h-2 w-2 shrink-0 rounded-full ' +
        (
          syncStatus ===
            'error'
            ? 'bg-clay'
            : syncStatus ===
                'syncing' ||
              syncStatus ===
                'loading'
              ? 'bg-amber-400'
              : 'bg-emerald-500'
        );
    }


    if (action) {
      action.textContent =
        '账号';
    }

    if (mobile) {
      mobile.textContent =
        '账号';
    }


    if (
      $('signedInEmail')
    ) {
      $('signedInEmail')
        .textContent =
          email;
    }


    if (
      $('signedInNicknameInput')
    ) {
      const input =
        $('signedInNicknameInput');

      if (
        document
          .activeElement !==
          input &&
        !nicknameBusy
      ) {
        input.value =
          displayName;
      }
    }


    if (
      $('signedInSyncText')
    ) {
      $('signedInSyncText')
        .textContent =
          syncLabel();
    }
  }


  // =========================================================
  // Cloud state
  // =========================================================

  async function pushCloudStateToApp(
    state
  ) {
    if (!state) return;


    if (
      window
        .CalcDailyApp
        ?.applyCloudState
    ) {
      window
        .CalcDailyApp
        .applyCloudState(
          state
        );

      return;
    }


    window.dispatchEvent(
      new CustomEvent(
        'calcdaily:cloud-state-ready',
        {
          detail: {
            state
          }
        }
      )
    );
  }


  function localState() {
    try {
      const raw =
        localStorage.getItem(
          'calcDaily.v2'
        );

      return raw
        ? JSON.parse(raw)
        : {};

    } catch {
      return {};
    }
  }


  // =========================================================
  // Session
  // =========================================================

  async function handleSession(
    session,
    eventName = ''
  ) {
    const user =
      session?.user ||
      null;


    if (
      (
        user?.id ||
        null
      ) !==
      currentSessionUserId
    ) {
      sessionGeneration++;
    }


    const generation =
      sessionGeneration;


    if (!user) {
      currentSessionUserId =
        null;

      window
        .CalcDailyCloud
        ?.setUser?.(
          null
        );

      syncStatus =
        'idle';

      syncMessage =
        '';

      setProfileMessage(
        ''
      );

      renderAccountUI();

      return;
    }


    const sameUser =
      currentSessionUserId ===
      user.id;


    currentSessionUserId =
      user.id;


    window
      .CalcDailyCloud
      ?.setUser?.(
        user
      );


    renderAccountUI();


    if (sameUser) {
      return;
    }


    try {
      syncStatus =
        'loading';

      syncMessage =
        '正在读取云端学习记录…';

      renderAccountUI();


      const merged =
        await window
          .CalcDailyCloud
          .resolveAfterSignIn(
            localState()
          );


      if (
        generation !==
        sessionGeneration
      ) {
        return;
      }


      await pushCloudStateToApp(
        merged
      );


      syncStatus =
        'synced';

      syncMessage =
        '云端已同步';

      renderAccountUI();

    } catch (error) {
      if (
        generation !==
        sessionGeneration
      ) {
        return;
      }


      console.warn(
        '登录后的云端同步失败',
        error
      );


      syncStatus =
        'error';

      syncMessage =
        error.message ||
        '同步失败';

      renderAccountUI();
    }
  }


  // =========================================================
  // Login / registration submit
  // =========================================================

  async function submitAuthForm(
    event
  ) {
    event.preventDefault();


    if (
      !configured() ||
      authBusy ||
      codeBusy
    ) {
      return;
    }


    const email =
      String(
        $('authEmailInput')
          ?.value ||
        ''
      ).trim();


    const password =
      String(
        $('authPasswordInput')
          ?.value ||
        ''
      );


    const nickname =
      String(
        $('authNicknameInput')
          ?.value ||
        ''
      ).trim();


    if (
      !email ||
      !password
    ) {
      setMessage(
        '请输入邮箱和密码。',
        'error'
      );

      return;
    }


    if (
      authMode ===
        'register' &&
      !nickname
    ) {
      setMessage(
        '请输入昵称。',
        'error'
      );

      return;
    }


    if (
      authMode ===
        'register' &&
      nickname.length > 20
    ) {
      setMessage(
        '昵称不能超过 20 个字符。',
        'error'
      );

      return;
    }


    if (
      authMode ===
      'register'
    ) {
      const code =
        String(
          $('authCodeInput')
            ?.value ||
          ''
        ).trim();


      if (
        !registrationInfo ||
        registrationInfo
          .email !==
          email ||
        !code
      ) {
        setMessage(
          '请先填写昵称、邮箱和密码，发送验证码，再填写验证码。',
          'error'
        );

        return;
      }


      if (
        registrationInfo
          .password !==
          password
      ) {
        setMessage(
          '密码已修改，请重新发送验证码。',
          'error'
        );

        return;
      }


      if (
        registrationInfo
          .nickname !==
          nickname
      ) {
        setMessage(
          '昵称已修改，请重新发送验证码。',
          'error'
        );

        return;
      }
    }


    authBusy = true;

    refreshCodeButton();


    const submit =
      $('authSubmitBtn');


    if (submit) {
      submit.disabled =
        true;

      submit.textContent =
        authMode ===
          'login'
          ? '登录中…'
          : '注册中…';
    }


    try {
      if (
        authMode ===
        'login'
      ) {
        const {
          error
        } =
          await client()
            .auth
            .signInWithPassword({
              email,
              password
            });


        if (error) {
          throw error;
        }


        setMessage(
          '登录成功，正在同步学习记录。',
          'success'
        );

      } else {
        const code =
          String(
            $('authCodeInput')
              ?.value ||
            ''
          ).trim();


        const result =
          await client()
            .auth
            .completeRegistration(
              registrationInfo,
              code,
              password,
              nickname
            );


        if (
          result?.error
        ) {
          throw result.error;
        }


        registrationInfo =
          null;


        if (
          $('authCodeInput')
        ) {
          $('authCodeInput')
            .value =
              '';
        }


        const session =
          result?.data
            ?.session ||
          null;


        if (!session) {
          throw new Error(
            '账号已创建，但未取得登录状态，请重新登录。'
          );
        }


        await handleSession(
          session,
          'SIGNED_IN'
        );


        setMessage(
          '账号已创建并登录；学习记录正在同步。',
          'success'
        );
      }

    } catch (error) {
      console.warn(
        '账号操作失败',
        error
      );


      setMessage(
        error?.message ||
        '账号操作失败。',
        'error'
      );

    } finally {
      authBusy =
        false;


      refreshCodeButton();


      if (
        currentUser() &&
        $('authPasswordInput')
      ) {
        $('authPasswordInput')
          .value =
            '';
      }


      if (submit) {
        submit.disabled =
          false;

        submit.textContent =
          authMode ===
            'login'
            ? '登录'
            : '创建账号';
      }
    }
  }


  // =========================================================
  // Nickname
  // =========================================================

  async function saveNickname() {
    const user =
      currentUser();


    if (
      !configured() ||
      !user ||
      nicknameBusy
    ) {
      return;
    }


    const nickname =
      String(
        $('signedInNicknameInput')
          ?.value ||
        ''
      ).trim();


    if (!nickname) {
      setProfileMessage(
        '昵称不能为空。',
        'error'
      );

      return;
    }


    if (
      nickname.length > 20
    ) {
      setProfileMessage(
        '昵称不能超过 20 个字符。',
        'error'
      );

      return;
    }


    nicknameBusy =
      true;


    const button =
      $('saveNicknameBtn');


    if (button) {
      button.disabled =
        true;

      button.textContent =
        '保存中…';
    }


    setProfileMessage('');


    try {
      const {
        data,
        error
      } =
        await client()
          .auth
          .updateUser({
            data: {
              display_name:
                nickname
            }
          });


      if (error) {
        throw error;
      }


      const updatedUser =
        data?.user ||
        {
          ...user,

          user_metadata: {
            ...(user
              .user_metadata ||
              {}),

            display_name:
              nickname
          }
        };


      const profileResult =
        await client()
          .from(
            'profiles'
          )
          .upsert(
            {
              user_id:
                updatedUser.id,

              display_name:
                nickname,

              last_active_at:
                new Date()
                  .toISOString()
            },
            {
              onConflict:
                'user_id'
            }
          );


      if (
        profileResult.error
      ) {
        throw profileResult
          .error;
      }


      window
        .CalcDailyCloud
        ?.setUser?.(
          updatedUser
        );


      setProfileMessage(
        '昵称已更新。',
        'success'
      );


      renderAccountUI();

    } catch (error) {
      setProfileMessage(
        error.message ||
        '昵称更新失败。',
        'error'
      );

    } finally {
      nicknameBusy =
        false;


      if (button) {
        button.disabled =
          false;

        button.textContent =
          '保存';
      }
    }
  }


  // =========================================================
  // Manual sync
  // =========================================================

  async function syncNow() {
    const user =
      currentUser();

    if (!user) return;


    const state =
      window
        .CalcDailyApp
        ?.getState?.() ||
      localState();


    try {
      syncStatus =
        'syncing';

      syncMessage =
        '正在同步学习记录…';

      renderAccountUI();


      await window
        .CalcDailyCloud
        ?.syncNow?.(
          state,
          {
            full: true
          }
        );


      syncStatus =
        'synced';

      syncMessage =
        '云端已同步';

      renderAccountUI();

    } catch (error) {
      syncStatus =
        'error';

      syncMessage =
        error.message ||
        '同步失败';

      renderAccountUI();
    }
  }


  // =========================================================
  // Logout
  // =========================================================

  async function logout() {
    if (
      !configured() ||
      authBusy
    ) {
      return;
    }


    try {
      const {
        error
      } =
        await client()
          .auth
          .signOut();


      if (error) {
        setProfileMessage(
          error.message ||
          '退出登录失败。',
          'error'
        );

        return;
      }


      await handleSession(
        null,
        'SIGNED_OUT'
      );


      closeModal();

    } catch (error) {
      setProfileMessage(
        error.message ||
        '退出登录失败。',
        'error'
      );
    }
  }


  // =========================================================
  // Event binding
  // =========================================================

  function invalidateRegistration() {
    registrationInfo =
      null;

    if (
      $('authCodeInput')
    ) {
      $('authCodeInput')
        .value =
          '';
    }
  }


  function bindEvents() {
    $('authSendCodeBtn')
      ?.addEventListener(
        'click',
        sendRegistrationCode
      );


    $('authEmailInput')
      ?.addEventListener(
        'input',
        invalidateRegistration
      );


    $('authPasswordInput')
      ?.addEventListener(
        'input',
        () => {
          if (
            authMode ===
            'register'
          ) {
            invalidateRegistration();
          }
        }
      );


    $('authNicknameInput')
      ?.addEventListener(
        'input',
        () => {
          if (
            authMode ===
            'register'
          ) {
            invalidateRegistration();
          }
        }
      );


    $('accountActionBtn')
      ?.addEventListener(
        'click',
        openModal
      );


    $('mobileAccountBtn')
      ?.addEventListener(
        'click',
        openModal
      );


    $('closeAccountModalBtn')
      ?.addEventListener(
        'click',
        closeModal
      );


    $('accountModal')
      ?.addEventListener(
        'click',
        event => {
          if (
            event.target ===
            $('accountModal')
          ) {
            closeModal();
          }
        }
      );


    document
      .addEventListener(
        'keydown',
        event => {
          if (
            event.key ===
              'Escape' &&
            !$(
              'accountModal'
            )?.classList
              .contains(
                'hidden'
              )
          ) {
            closeModal();
          }
        }
      );


    $('authLoginTab')
      ?.addEventListener(
        'click',
        () =>
          setMode(
            'login'
          )
      );


    $('authRegisterTab')
      ?.addEventListener(
        'click',
        () =>
          setMode(
            'register'
          )
      );


    $('authForm')
      ?.addEventListener(
        'submit',
        submitAuthForm
      );


    $('saveNicknameBtn')
      ?.addEventListener(
        'click',
        saveNickname
      );


    $('signedInNicknameInput')
      ?.addEventListener(
        'keydown',
        event => {
          if (
            event.key ===
            'Enter'
          ) {
            event.preventDefault();

            saveNickname();
          }
        }
      );


    $('syncNowBtn')
      ?.addEventListener(
        'click',
        syncNow
      );


    $('logoutBtn')
      ?.addEventListener(
        'click',
        logout
      );


    window.addEventListener(
      'calcdaily:sync-status',
      event => {
        syncStatus =
          event.detail
            ?.status ||
          'idle';

        syncMessage =
          event.detail
            ?.message ||
          '';

        renderAccountUI();
      }
    );
  }


  // =========================================================
  // Init
  // =========================================================

  async function initAuth() {
    bindEvents();

    setMode('login');

    renderAccountUI();

    refreshCodeButton();


    window.CalcDailyAuth = {
      openModal,
      closeModal
    };


    if (!configured()) {
      return;
    }


    const {
      data:
        authListener
    } =
      client()
        .auth
        .onAuthStateChange(
          (
            event,
            session
          ) => {
            setTimeout(
              () => {
                handleSession(
                  session,
                  event
                );
              },
              0
            );
          }
        );


    window.CalcDailyAuth = {
      openModal,

      closeModal,

      unsubscribe() {
        authListener
          ?.subscription
          ?.unsubscribe?.();
      }
    };


    const {
      data,
      error
    } =
      await client()
        .auth
        .getSession();


    if (error) {
      console.warn(
        '读取 CloudBase Session 失败',
        error
      );

      return;
    }


    await handleSession(
      data?.session ||
      null,
      'BOOTSTRAP'
    );
  }


  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      () =>
        initAuth()
          .catch(
            error =>
              setMessage(
                error.message ||
                '账号初始化失败。',
                'error'
              )
          )
    );

  } else {
    initAuth()
      .catch(
        error =>
          setMessage(
            error.message ||
            '账号初始化失败。',
            'error'
          )
      );
  }
})();