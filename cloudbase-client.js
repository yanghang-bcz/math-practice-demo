(() => {
  'use strict';

  // 仅填写控制台的 Publishable Key；不要填写服务端 API Key / SecretKey。
  const PUBLISHABLE_KEY = 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ijg5YzQ3NWY5LTE0NzMtNDhmMy1hZDEzLTM4MzkxMDc0ZDFhNyJ9.eyJpc3MiOiJodHRwczovL2NhbGNkYWlseS1kNWcydGl0d3VlOTE1NTFmYi5hcC1zaGFuZ2hhaS50Y2ItYXBpLnRlbmNlbnRjbG91ZGFwaS5jb20iLCJzdWIiOiJhbm9uIiwiYXVkIjoiY2FsY2RhaWx5LWQ1ZzJ0aXR3dWU5MTU1MWZiIiwiZXhwIjo0MDkyNDQ0NDMxLCJpYXQiOjE3ODg3NjEyMzEsIm5vbmNlIjoiRExmdjh3RmVTQ3VfWmZKV0pBclZTQSIsImF0X2hhc2giOiJETGZ2OHdGZVNDdV9aZkpXSkFyVlNBIiwibmFtZSI6IkFub255bW91cyIsInNjb3BlIjoiYW5vbnltb3VzIiwicHJvamVjdF9pZCI6ImNhbGNkYWlseS1kNWcydGl0d3VlOTE1NTFmYiIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJyb2xlIjoiYW5vbiIsImlzX2Fub255bW91cyI6dHJ1ZSwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiYW5vbnltb3VzIiwicHJvdmlkZXJzIjpbImFub255bW91cyJdfSwidXNlcl9tZXRhZGF0YSI6eyJuYW1lIjoiQW5vbnltb3VzIn0sInVzZXJfdHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3VzZXIiLCJpc19zeXN0ZW1fYWRtaW4iOmZhbHNlfQ.yuYbWmprQa5MT4Y5OFnRxVUYgAMRAMXqMDUz6gVlsppJ__igp71AIZ5uFciGpyJAdiGVZFAPoV5W73UPOgXN6g7Lvuxq3VVjUcyUbiRGb9qoufsqIi480-ygPGl70HDgPn0VCwl1SjmomlxXptEJCrcXIvI6eq1io7bJ5ukqTEueUYKx7idtjXj9Uf1exONs38O3vS4dVG9jVldSKoiG2i1J8F0lzAJtrTzaGuqM4TEfC_rtGe02Vtc7DDtu6Huo7JngpCu4kFzfRvCU_u8exkox7fKkNCpW8D21vTRIyCe9U4AIsI44sRDvACFMKLIJbrJTZKcM2V7oPecrUrKgbg';
  const ENV_ID = 'calcdaily-d5g2itwue91551fb';
  const REGION = 'ap-shanghai';
  const configured = Boolean(PUBLISHABLE_KEY.trim() &&
    !PUBLISHABLE_KEY.startsWith('YOUR_') && window.cloudbase?.init);

  function normalizeUser(user) {
    if (!user || user.is_anonymous || user.isAnonymous ||
        user.role === 'anon' || !user.email) return null;
    const id = user.id || user.uid || user.user_metadata?.uid;
    if (!id) return null;
    return {
      ...user,
      id: String(id),
      user_metadata: {
        ...(user.user_metadata || {}),
        display_name: user.nickname || user.nickName ||
          user.user_metadata?.nickName || user.user_metadata?.nickname ||
          user.user_metadata?.name || user.user_metadata?.display_name || ''
      }
    };
  }

  function normalizeSession(session) {
    const user = normalizeUser(session?.user);
    return user ? { ...session, user } : null;
  }

  let client = null;
  let initializationError = null;
  if (configured) {
    try {
      const app = window.cloudbase.init({
        env: ENV_ID, region: REGION, accessKey: PUBLISHABLE_KEY
      });
      const auth = app.auth;
      const db = app.rdb();
      client = {
        from: table => db.from(table),
        auth: {
          signInWithPassword: params => auth.signInWithPassword(params),
          signOut: () => auth.signOut(),
          async getSession() {
            const result = await auth.getSession();
            return { ...result, data: {
              ...result.data, session: normalizeSession(result.data?.session)
            } };
          },
          onAuthStateChange(callback) {
            return auth.onAuthStateChange((event, session) => {
              callback(event, normalizeSession(session));
            });
          },
          async updateUser({ data }) {
            const result = await auth.updateUser({ nickname: data.display_name });
            return { ...result, data: {
              ...result.data, user: normalizeUser(result.data?.user)
            } };
          },
          // 显式两阶段流程允许先发码、后输入密码；不在发码阶段创建账号。
          async sendRegistrationCode(email) {
            const info = await auth.getVerification({ email, usage: 'email' });
            if (!info.verification_id) throw new Error('未取得验证码标识，请重新发送。');
            return { email, ...info };
          },
          async completeRegistration(info, token, password, nickname) {
            const proof = await auth.verify({
              verification_id: info.verification_id,
              verification_code: token
            });
            if (!proof.verification_token) throw new Error('邮箱验证未完成，请重新发送验证码。');
            // 与 SDK signUp 的内部新用户分支一致。已有账号不重设密码或昵称。
            if (info.is_user) throw new Error('该邮箱已有账号，请切换到登录并使用原密码。');
            const result = await auth.signUp({
              email: info.email, password, name: nickname,
              verification_token: proof.verification_token,
              verification_code: token
            });
            if (result?.error) throw result.error;
            // verification_token 路径返回 LoginState，统一重新读取标准 Session。
            return this.getSession();
          }
        }
      };
    } catch (error) {
      initializationError = error;
      console.warn('CloudBase 初始化失败', error);
    }
  }
  window.CalcDailyCloudBase = {
    configured: configured && Boolean(client), client, normalizeUser,
    env: ENV_ID, region: REGION, initializationError
  };
})();
