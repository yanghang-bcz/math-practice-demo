# CalcDaily · CloudBase 迁移版

基于 `bcz66/math-practice-demo` 的 main 分支制作，基准提交为
`642f0d66dfec32f55eee2eaa30c098d7b6427a2d`（交付前再次核对 main 未变化）。

## 怎么覆盖

1. 先备份原仓库。将覆盖包里的 `cloudbase-client.js`、`auth.js`、`storage.js`、`index.html` 放进仓库根目录，覆盖同名文件。
2. 打开 `cloudbase-client.js`，将 `YOUR_CLOUDBASE_PUBLISHABLE_KEY_HERE` 替换为你的 **CloudBase Publishable Key**。环境 ID 和上海地域已经填好：
   - EnvId：`calcdaily-d5g2itwue91551fb`
   - Region：`ap-shanghai`
3. 原 `supabase-client.js` 已不再被页面引用，可以保留作回退备份。原 `supabase-schema.sql` 是 Supabase 专用，不要在 CloudBase 执行它。
4. 继续使用现有 Vercel 项目和部署方式。`api/deepseek.js` 与 Vercel 上的 DeepSeek 环境变量均无需修改。部署后刷新页面；必要时强制刷新，确保四个文件来自同一版本。
5. 按下面的真实环境验收清单测试。此交付没有自动提交 GitHub，也没有部署或修改你的线上数据库。

覆盖包另有本说明和 `verification/`，后者是可选的检查工具，可留在本地，不必部署。原仓库的 README 保留，但其中 Supabase 接入部分应以本文件为准。

## 改动范围

| 文件 | 改动 |
| --- | --- |
| `cloudbase-client.js` | CloudBase 初始化、`app.rdb()`、认证返回值转换、邮箱验证码注册、匿名会话过滤；替代原客户端文件 |
| `auth.js` | 发验证码、倒计时、验证码验证、邮箱密码登录、昵称更新、会话恢复与账号状态 |
| `storage.js` | 改用 CloudBase PostgreSQL，保留八张表的字段映射与原状态合并方式；串行同步、账号切换取消、清空前等待在途写入 |
| `index.html` | 换 SDK 与客户端引用，增加验证码字段，更新配置提示；为账号弹窗增加高度限制及滚动 |

`app.js`、`api/deepseek.js` 与基准提交的 Git blob 哈希完全一致。自适应算法、题目/判题逻辑、本地备用题、诊断、每日练习、错题复习、打卡、仪表盘与难度设置未改动，也没有删除原有可见功能。

## 注册与登录

注册顺序：**昵称 → 邮箱 → 发送邮箱验证码 → 验证码 → 密码 → 创建账号**。

为了让用户先发验证码、后填写密码，本版使用固定 SDK 的公开两阶段接口：

1. `auth.getVerification({ email, usage: 'email' })` 发送邮件，内存中保存 `verification_id` 和对应邮箱。
2. 点击创建账号时，`auth.verify({ verification_id, verification_code })` 校验验证码。
3. 使用返回的 `verification_token`，调用 `auth.signUp({ email, password, name, verification_token, verification_code })` 创建账号。该分支与 SDK 自带 `signUp` 验证回调内部的新用户注册分支一致；它可能返回旧格式 LoginState，因此随后统一用 `getSession()` 读取标准会话。
4. 密码只在创建账号时提交，不在发码阶段保存。验证码上下文只存在页面内存中，刷新页面或更换邮箱后需重新发送。重发按钮有 60 秒冷却，实际频率与有效期仍由 CloudBase 服务端控制。

**这不是 Supabase 的邮箱确认链接流程，也没有混用独立 `verifyOtp` 的入参。** 如果服务器返回邮箱已有账号，注册入口会提示切换登录，不会把输入的新密码或昵称覆盖到旧账号。两设备同时注册同一邮箱的冲突由服务端处理。

登录继续使用 `signInWithPassword({ email, password })`。昵称通过 CloudBase `updateUser({ nickname })` 更新，并同步到 `profiles.display_name`。转换层将 CloudBase 的 `user_metadata.nickName` 等信息映射回现有 UI 使用的 `display_name`，不限制昵称为英文用户名。

SDK 固定为官方 CDN 的 **3.9.2**：
`https://static.cloudbase.net/cloudbase-js-sdk/3.9.2/cloudbase.full.js`。
该版本的实际 CDN 已在浏览器检查，包含 `app.rdb()`、`maybeSingle()`、`upsert()`、`delete()` 和本版所用认证接口。不要直接换成旧文档示例里的 3.0.1。

## 游客、本地缓存与同步

- 沿用本地缓存键 `calcDaily.v2`。未填 Key 或 SDK 加载失败时仍可本地学习。
- 即使 SDK 因公开 Key 产生匿名会话，也不会将其视作登录账号，不会把游客学习数据写入匿名账户。
- 首次登录保留原来的本地/云端快照合并策略：记录按 ID 去重，复习记录按更新时间取新，打卡日期合并，能力模型与设置采用较新快照。正在进行中的练习只保留在本机。
- `_meta.cloudUserId` 继续用于识别数据归属。换账号时，不把另一个账号的本地记录合并给新账号。退出后本地缓存不会被删除。
- 自动同步保留 900ms 防抖；多次手动同步按顺序完成。初次读取失败时，点击“立即同步”会先重试读取及合并，避免直接用未知状态覆盖云端。
- 清空账号学习数据删除七张学习表中当前用户的记录，保留 `profiles` 和认证账号。先取消未发出的同步并等待在途写入；远端删除失败会抛出错误，由原 `app.js` 保留本地数据。七张表分步删除，不是跨表事务；部分失败时可重试。
- 保留原项目的多设备合并策略：旧设备仍有历史本地数据时，后续登录可能再次合并这些历史数据。全设备一致删除的墓碑/版本协议不在此次迁移范围内；清空全部学习记录时请同时处理其他设备上的旧缓存。

## 已建 CloudBase 数据库需要满足的条件

你提供的八张表、`user_id varchar(64)` 与基于 `auth.uid()` 的 RLS 作为前提。**本次没有连接真实数据库，未核验实际列、唯一约束或策略。** 表名存在还不够，需保证字段与下面的清单匹配。

| 表 | upsert 所需唯一键/主键 |
| --- | --- |
| profiles | user_id |
| user_state | user_id |
| user_settings | user_id |
| module_progress | user_id, module |
| topic_progress | user_id, module, topic |
| attempts | user_id, id |
| review_queue | user_id, id |
| checkins | user_id, checkin_date |

所有表的 `user_id` 使用 `varchar(64)`，不要继续依赖 Supabase 的 `auth.users(id)` UUID 外键。其他字段保留原表结构；JSON 字段使用 `jsonb`，不要改成 JSON 字符串列。

RLS 应同时覆盖 SELECT、INSERT、UPDATE、DELETE：`USING (user_id = auth.uid())` 限定可见/可改行，`WITH CHECK (user_id = auth.uid())` 限定写入归属；还需要适当的 schema/table GRANT。只有 SELECT 策略会导致 upsert 或清空失败。Publishable Key 只用作公开客户端配置，绝不能填服务端 API Key、service_role Key、SecretId 或 SecretKey。

下面是代码实际写入的字段：

- `profiles`：`user_id`, `display_name`, `last_active_at`。

- `user_state`：`user_id`, `state_json`, `updated_at`。

- `user_settings`：`user_id`, `difficulty_mode`, `training_mode`, `daily_count`, `manual_levels`, `updated_at`。

- `module_progress`：`user_id`, `module`, `ability`, `display_level`, `confidence`, `effective_attempts`, `updated_at`。

- `topic_progress`：`user_id`, `module`, `topic`, `ability`, `attempts`, `correct`, `confidence`, `updated_at`。

- `attempts`：`user_id`, `id`, `question_id`, `module`, `topic`, `purpose`, `question_json`, `user_answer`, `correct`, `needs_manual_check`, `counts_toward_stats`, `error_type`, `requested_difficulty`, `provisional_difficulty`, `calibrated_difficulty`, `difficulty_model_version`, `difficulty_confidence`, `difficulty_dimensions`, `ability_before`, `ability_after`, `predicted_correct_probability`, `learning_rate`, `ability_weight`, `topic_ability_before`, `topic_ability_after`, `created_at`。

- `review_queue`：`user_id`, `id`, `review_key`, `module`, `topic`, `question_json`, `wrong_count`, `correct_streak`, `high_freq`, `next_review_at`, `provisional_difficulty`, `calibrated_difficulty`, `difficulty_model_version`, `updated_at`。

- `checkins`：`user_id`, `checkin_date`。

## 旧 Supabase 用户和历史数据

这是前端认证/存储接入迁移，不会自动复制 Supabase 的认证账号或云端数据。原密码、Supabase UUID 与 CloudBase 用户 ID 不能直接互换。

未绑定旧账号的游客缓存仍可按原逻辑并入新账号；带旧 Supabase `_meta.cloudUserId` 的缓存会被视为“其他账号数据”，不会擅自并入新的 CloudBase 身份。正式切换前，请先备份旧数据；如需迁移旧账号记录，应在核实账号归属后做单独的用户 ID 映射与数据导入。不要为图方便批量取消归属校验。

## 真实环境验收

1. 填入 Publishable Key，部署到已加入白名单的 `math-practice4u.vercel.app`。本地调试需另行允许对应本地来源，不能用正式域名白名单代替。
2. 游客先做一题，刷新后确认本地记录仍在。
3. 使用一个未注册邮箱发码；收到邮件后输入验证码和密码创建账号。确认昵称正确、进度仍在、云同步状态成功。
4. 退出，再用同一邮箱与密码登录。刷新页面检查会话恢复，在另一浏览器登录确认云端记录可恢复。
5. 修改昵称，刷新及另一浏览器登录后核对新昵称。
6. 完成练习、复习、打卡及设置修改，确认相关表写入成功。
7. 用单独的测试账号验证清空：账号和昵称保留，七张学习表记录删除；模拟断网时本地记录不应因远端失败而被清掉。
8. 用两个测试账号交叉检查 RLS：A 不能读、改、删 B 的数据。客户端筛选条件不能替代这一权限检查。

如果收不到邮件，检查邮箱验证码身份源、发信配置和邮件垃圾箱。如果密码登录报身份源未启用，检查“用户名密码登录”。如果读写失败，优先查看表列、唯一约束、RLS 与 GRANT；若是跨域错误，检查当前访问来源是否在同一 CloudBase 环境白名单。

## 已完成的验证与复查方式

- 静态语法：三个迁移 JavaScript 文件、未改动的 `app.js`、`api/deepseek.js`，以及页面内联 JavaScript。
- 自动模拟回归：`node verification/regression.cjs`。覆盖注册、旧邮箱保护、昵称、账号状态、八表同步、账号隔离、失败处理及并发清空。模拟测试不代表真实 CloudBase 请求已成功。
- 浏览器：原页面与注册表单实际打开；账号弹窗可滚动；官方 SDK 实际接口检查通过。`verification/sdk-smoke.html` 可经本地 HTTP 服务打开复查，不会发送数据库写入或邮件。
- 原始代码校验：`app.js` Git blob SHA `ad9e495fe1f6e0836ffcd0bba856eace1395c679`；`api/deepseek.js` Git blob SHA `ea42117c8a52e70e68615526c05db53510288955`。

测试详情见 `verification/RESULTS.md`。没有真实 Publishable Key 和测试账号，因此未声称真实注册、邮件投递、云端 RLS 或 Vercel 部署已验收。

## 官方资料

- [CloudBase SDK 初始化](https://docs.cloudbase.net/api-reference/webv3-pg/initialization)
- [CloudBase 认证接口](https://docs.cloudbase.net/api-reference/webv3-pg/authentication)
- [CloudBase PostgreSQL 接入与权限](https://docs.cloudbase.net/database/postgresql/initialization)
- [固定版本 SDK 及公开接口定义](https://www.npmjs.com/package/@cloudbase/js-sdk/v/3.9.2)
