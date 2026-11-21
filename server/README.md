# WebChat server

WebChat（chat-demo）的可选后端：为在线版代理 DeepSeek API、保存云端会话和图片，并提供密码登录与云端备份接口。

后端只监听 `127.0.0.1`，生产环境应由 Caddy 或其他反向代理提供 HTTPS 和在线版静态文件。

## 要求

- Node.js 24+（使用 `node:sqlite`）
- pnpm

## 快速开始

```sh
cd server
pnpm install
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env
pnpm hash-password "your-password"
# 把输出填入 .env 的 APP_PASSWORD_HASH，再填写其他变量；
# 本地 HTTP 调试把 COOKIE_SECURE 设为 0
pnpm dev
```

默认地址为 `http://127.0.0.1:8787`。

开发在线版时，在仓库根目录另开一个终端：

```sh
pnpm dev:online
```

访问 http://localhost:8090 。`pnpm dev:online` 会把浏览器发往 `/api` 的请求代理到本后端。

也可以在仓库根目录双击 `start.bat`：已创建 `server/.env` 时会同时启动后端和在线版前端，并自动打开页面；`start.bat local` 只启动本地静态版。该脚本用于开发环境。

## 配置

复制 [.env.example](.env.example) 为 `.env` 后修改。所有变量都在服务端读取，不要提交 `.env`。

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | 是 | — | 服务端持有的上游 API Key；在线版浏览器不会接触到它 |
| `APP_PASSWORD_HASH` | 是 | — | 登录密码的 scrypt 哈希，用 `pnpm hash-password "密码"` 生成 |
| `PORT` | 否 | `8787` | 后端监听端口 |
| `DATA_DIR` | 否 | `./data` | SQLite 和图片目录；相对于启动目录 |
| `DEEPSEEK_API_ORIGIN` | 否 | `https://api.deepseek.com` | 在线版实际使用的上游 API 根地址，不包含 `/anthropic/v1` 或 `/v1/tools` |
| `APP_ORIGIN` | 在线版建议设置 | — | 在线版的公开 origin，例如 `https://chat.example.com:54321`；用于 CORS 和 Origin 校验 |
| `ALLOWED_SYNC_ORIGINS` | 本地同步时设置 | — | 允许跨源同步的本地版 origin，逗号分隔；必须包含协议、主机和端口 |
| `COOKIE_SECURE` | 否 | `1` | 是否给登录 Cookie 加 `Secure`；只在本地 HTTP 调试时设为 `0` |
| `TOKEN_TTL_DAYS` | 否 | `90` | 登录 Token 和 Cookie 的有效天数 |
| `MAX_CHAT_BYTES` | 否 | `2097152`（2 MiB） | 聊天请求和云端会话 JSON 的大小上限 |
| `MAX_FILE_BYTES` | 否 | `26214400`（25 MiB） | 单个上传文件的上限 |
| `MAX_ASR_BYTES` | 否 | `8388608`（8 MiB） | 语音识别音频的大小上限 |

`APP_ORIGIN` 和 `ALLOWED_SYNC_ORIGINS` 中的 origin 必须与浏览器地址栏完全一致。例如：

```dotenv
APP_ORIGIN=https://chat.example.com:54321
ALLOWED_SYNC_ORIGINS=http://localhost:8090,https://chat.example.com:54321
```

本地开发时，如果在线版通过 `http://localhost:8090` 访问，把该地址加入 `APP_ORIGIN` 或 `ALLOWED_SYNC_ORIGINS`。如果本地版通过 `file://` 打开，浏览器发送的 `Origin` 是字符串 `null`；默认不支持，建议改用 HTTP 提供本地版。

在线版的文件上传还受 `MAX_FILE_BYTES` 限制（默认 25 MiB）。前端本地校验允许更大的文件，最终以服务端限制为准；需要上传更大的文件时，同时调大 `MAX_FILE_BYTES` 和反向代理的请求体限制。

修改 `.env` 后需要重启后端；`pnpm dev` 的 watch 不保证重新加载环境变量。

## 认证与来源校验

- 当前是单密码部署，不是多用户账号系统：知道密码的人共享同一份云端历史和服务端 API Key 配额。不要把密码公开，也不要把它当成多人隔离的托管服务。
- 在线版：登录成功后设置 HttpOnly Cookie，浏览器同源访问云端和代理接口。
- 本地版同步：登录接口同时返回 Bearer Token，本地版把 Token 存在 localStorage，跨源请求使用 `Authorization: Bearer`。
- 浏览器发起的非 GET / HEAD / OPTIONS 请求会校验 `Origin`，只接受 `APP_ORIGIN`、`ALLOWED_SYNC_ORIGINS` 或与请求本身同源的来源；无 `Origin` 的非浏览器请求由认证层处理。
- 登录失败按客户端 IP 限流：15 分钟内最多 5 次。反向代理需要正确传递 `X-Forwarded-For` 或 `X-Real-IP`。
- Token 只保存 SHA-256 哈希；密码只保存 scrypt 哈希。
- 修改密码后需要更新 `APP_PASSWORD_HASH` 并重启后端。已签发的 Token 不会自动失效；需要强制所有设备重新登录时，清空 SQLite 中的 `auth_tokens` 表。

## 数据

`DATA_DIR` 下保存：

```text
app.db          SQLite：云端会话、图片元数据、登录 Token 哈希
files/          云端图片原件，文件名是附件 id
```

- 云端会话以完整 JSON 保存，分为 `backup`（设备同步的只读备份）和 `online`（在线版对话）。
- 只有图片原件上传到云端；非图片附件只保存会话里的文件元数据。
- 删除云端会话时会清理不再被任何云端会话引用的图片。
- 当前不对 SQLite 和图片做静态加密，请限制 `DATA_DIR` 的访问权限，不要把目录放在公开静态站点下。

备份时建议先停服，整体复制 `DATA_DIR`；如果服务不能停，使用 SQLite 的在线 backup 机制，再复制 `files/`。

## API

云端和代理接口需要登录；`/api/health`、`/api/login` 和 `/api/logout` 不需要。

| 方法和路径 | 说明 |
| --- | --- |
| `GET /api/health` | 健康检查 |
| `POST /api/login` | 密码登录；body 为 `{ password }`，设置 Cookie 并返回 Bearer Token |
| `POST /api/logout` | 退出登录，撤销当前 Token |
| `GET /api/me` | 检查登录状态 |
| `GET /api/cloud/sessions?kind=backup\|online` | 云端会话列表 |
| `GET /api/cloud/sessions/:id` | 读取单个云端会话 |
| `PUT /api/cloud/sessions/:id` | 覆盖保存云端会话；body 为 `{ kind, session }` |
| `DELETE /api/cloud/sessions/:id` | 删除云端会话 |
| `POST /api/cloud/sessions/:id/convert` | 把 `backup` 原子转换为新的 `online` 会话，并删除原备份 |
| `PUT /api/cloud/files/:id` | 上传云端图片原件（multipart，字段名 `file`） |
| `GET /api/cloud/files/:id` | 读取云端图片原件 |
| `POST /api/chat` | 代理 Messages API，返回 SSE |
| `POST /api/files` | 代理 Files API；图片会同时落盘 |
| `POST /api/speech/asr` | 代理语音识别 |
| `POST /api/speech/tts` | 代理语音合成，返回音频字节流 |

## 生产部署

1. 在仓库根目录构建在线版：

   ```sh
   pnpm build:online
   ```

2. 用 Caddy 托管 `dist-online/`，并把 `/api/*` 反代到 `127.0.0.1:8787`。示例见 [Caddyfile.example](Caddyfile.example)，需要替换域名、TLS 方式和 `dist-online` 路径。
3. 设置 `APP_ORIGIN` 为公开的在线版 origin；为本地版设置 `ALLOWED_SYNC_ORIGINS`。
4. 生产环境保持 `COOKIE_SECURE=1` 并使用 HTTPS。只有本地 HTTP 调试才设为 `0`。
5. 启动后端：

   ```sh
   pnpm start
   ```

SSE 需要关闭反向代理的响应缓冲；Caddy 示例中的 `flush_interval -1` 就是为此设置的。请同时确认反向代理的请求体大小限制不低于 `MAX_FILE_BYTES`。

在线版构建包含 PWA 的 `manifest.json` 和 `sw.js`。Caddy 示例给 `/sw.js` 设置了 `Cache-Control: no-cache`。PWA 安装和 Service Worker 需要 HTTPS。

标准 Caddy 不带 dynv6 DNS 模块。可以先用 acme.sh 的 `dns_dynv6` 申请证书，再在 Caddyfile 中用 `tls` 指向 `fullchain.pem` 和 `privkey.pem`；也可以自行构建带 dynv6 模块的 Caddy。示例见 [Caddyfile.example](Caddyfile.example)。

Windows 可以用任务计划程序、NSSM 或其他服务管理器保持后端运行；Linux 可以用 systemd。无论哪种方式，都要让工作目录指向 `server/`，或显式设置 `DATA_DIR` 的绝对路径。

## Scripts

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | tsx watch 启动 |
| `pnpm start` | 启动服务 |
| `pnpm type` | TypeScript 类型检查 |
| `pnpm hash-password` | 生成 `APP_PASSWORD_HASH` |
