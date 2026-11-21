# WebChat

[English](README.md) | 简体中文

WebChat 是基于 DeepSeek API 的聊天界面。默认构建是纯静态应用：会话和附件保存在浏览器，浏览器直接请求配置的 API 服务。可选的 Node 服务端增加了密码保护的云端备份，以及由服务端持有 API Key 的在线版。

## 部署方式

| 方式 | 构建 | 后端 | API Key | 会话存储 |
| --- | --- | --- | --- | --- |
| 静态 / 本地版 | `pnpm build` → `dist/` | 不需要；云端备份时可选 [server/](server/README.md) | 在设置中填写，保存在浏览器 | IndexedDB；可选按会话云端备份 |
| 服务端在线版 | `pnpm build:online` → `dist-online/` | [server/](server/README.md) | 服务端环境变量 `DEEPSEEK_API_KEY` | 只在云端；设备备份只读 |

静态版也可以使用云端备份：在设置 → 云端中登录，然后逐个会话开启同步。

## 运行

准备 Node.js 22.12+ 和 pnpm。服务端使用 `node:sqlite`，需要 Node.js 24+。

```sh
git clone https://github.com/dynnbw/WebChat.git
# SSH: git clone git@github.com:dynnbw/WebChat.git
cd WebChat
pnpm install
pnpm dev
```

打开 http://localhost:8090 。

生成静态产物：

```sh
pnpm build
```

产物位于 `dist/`，可部署到静态服务器，也可直接打开 `dist/index.html`。直接打开时，浏览器和 API 服务需允许 `file://` 页面的存储与跨域请求。云端同步时 `file://` 页面发送的 `Origin` 是 `null`；更推荐通过 HTTP 提供页面，而不是启用 `null` 来源。

### 服务端在线版

先启动后端：

```sh
cd server
pnpm install
cp .env.example .env
pnpm hash-password "your-password"
# 把输出填入 APP_PASSWORD_HASH，再设置 DEEPSEEK_API_KEY、APP_ORIGIN
# 和 ALLOWED_SYNC_ORIGINS；本地 HTTP 调试把 COOKIE_SECURE 设为 0
pnpm dev
```

然后在仓库根目录（如果还在 `server/`，先执行 `cd ..`）：

```sh
pnpm dev:online
```

打开 http://localhost:8090 。开发时 `/api` 会代理到 `127.0.0.1:8787`。

生产环境执行 `pnpm build:online`，用 Caddy 或其他反向代理托管 `dist-online/`，并把 `/api/*` 转发到后端。后端只监听 `127.0.0.1`。完整配置见 [server/README.md](server/README.md) 和 [server/Caddyfile.example](server/Caddyfile.example)。

在线版会把在线/离线选择保存在 localStorage。可以在登录页点「离线使用」，或在设置 → 通用设置中切换；切换后页面会刷新。离线历史使用同一 origin 下的 IndexedDB。

### Windows 一键启动

双击 [start.bat](start.bat)，或在终端运行：

```bat
start.bat
start.bat local
```

该脚本启动的是开发服务器。不带参数时，如果存在 `server/.env` 就启动在线版，否则启动本地静态版。在线模式会启动后端和在线版前端，缺少依赖时自动安装，然后打开 http://localhost:8090。如果两个端口都已在监听，则只打开页面，不重复启动。也可以显式使用 `start.bat online` 或 `start.bat local`。生产环境请使用上面的构建和部署步骤。

## 功能

- 多会话、自动标题、重命名与删除；编辑提问、重新生成和切换消息分支。
- 流式回答、深度思考、智能搜索、链接阅读与来源引用；支持停止和符合条件的继续生成。
- 附件上传、粘贴与拖拽，语音输入和回复朗读；移动端录音时输入框首行显示实时频谱。
- 左上角自动朗读开关，可选择「完成后朗读」或「流式朗读」。
- Markdown、代码高亮、KaTeX 公式和 Mermaid 图表。
- 自定义系统提示词与模型切换；被安全拒绝的回复显示「此回答敏感」，可展开查看原文。
- 数据统计：按时间查看 API 请求、搜索调用和 token 用量，按模型拆分，本地版和在线版都可用。
- 可按会话开启云端备份，并提供由服务端持有 API Key 的在线版。设备备份只读；可以从备份创建在线对话，创建后原备份会被删除。
- 在线版支持运行时切换在线/离线模式，同一 origin 下可以分别使用云端或本地历史。
- 支持安装为 PWA：生产构建包含 manifest、图标和 Service Worker，缓存应用壳；不会缓存 API 或云端数据。
- 简体中文与英文、浅色与深色主题、移动端布局、位置设置、历史导入导出。

## 数据

### 本地 / 静态版

- API Key、语言、主题、系统提示词、模型、朗读设置、云端地址和云端 Token 保存在浏览器 localStorage。
- 会话和附件原件保存在 IndexedDB。
- 本地数据按浏览器用户配置和站点源（origin）隔离。
- 设置 → 数据管理 → 导入 / 导出使用 ZIP 格式。导入会在确认并校验成功后替换全部本地会话和附件；导出包含会话与本地可用的图片原件，不包含 API Key、设置或非图片附件原件。导入不会删除已有的云端备份。格式与保留范围见[历史导入导出](src/services/chat/history/README.md)。
- 设置 → 数据管理 → 删除所有对话，会在确认后清空全部本地会话、附件原件和未发送的草稿。API Key 和其他设置保留，已上传到 API 服务的文件不受影响，已有的云端备份也不会被删除。

### 云端备份与在线版

- 云端数据由后端保存在 `DATA_DIR/app.db`（SQLite）和 `DATA_DIR/files/`（图片原件）。会话以完整 JSON 保存。
- 只有图片原件会上传到云端。其他附件只保留元数据，因此在其他设备上只能看到文件信息，不能打开原件。
- 静态版要使用云端同步时，需要把该应用的完整 origin 加入服务端的 `ALLOWED_SYNC_ORIGINS`。
- 在会话菜单中逐个开启同步：开启时立即上传一次，之后在回复结束和其他关键修改后防抖上传。
- 在线版上传受服务端 `MAX_FILE_BYTES` 限制，实际上限可能低于本地版前端的校验上限。
- 关闭同步或删除本地会话不会删除云端副本；设备备份只能在在线版中删除。
- 在线版把设备备份显示为只读。会话菜单可以把备份转为可继续聊天的在线对话；转换会删除云端备份，并停止同源离线副本的自动同步。
- 在线对话只存在云端，每轮回复结束及其他关键修改后自动保存。不做双向同步、冲突合并或设置同步。
- 在线版使用服务端 API Key。用户使用服务端密码登录，API Key 不会发送到浏览器。
- 服务端是单密码部署，不是多用户账号系统。知道密码的人共享同一份云端历史和 API Key 配额。
- 在线版设置只显示「通用设置」。历史导入导出和「删除所有对话」属于本地模式功能。如果要导入已有 ZIP：在同一 origin 下切到离线模式，导入历史，对需要的会话开启同步，再切回在线版。
- 服务端不会对 SQLite 数据库或图片文件做静态加密。请保护 `DATA_DIR`、使用 HTTPS，并把后端放在反向代理之后。

发送对话、上传附件和使用语音功能时，相应内容会提交给配置的 API 服务；在线版会经过后端代理。

### PWA 与离线行为

- `pnpm build` 和 `pnpm build:online` 会在产物中同时生成 `sw.js`、manifest 和图标。
- 安装要求 HTTPS 或 localhost；`file://` 页面无法注册 Service Worker。
- Service Worker 只缓存应用壳和构建静态资源，不缓存 `/api`、云端会话或跨域 API 请求。
- 本地/静态版安装后离线可以打开界面并使用 IndexedDB 历史；发消息仍需要网络。
- 在线版安装后离线只能打开应用壳，云端历史不可用；登录失败页提供「离线使用」入口，可切到本地模式。
- 新版本 Service Worker 会等旧页面关闭后激活，因此更新在下次打开时生效。开发服务器不注册 Service Worker。
- 要验证安装和离线效果，请通过 localhost 或 HTTPS 提供 `dist/` 或 `dist-online/`。

## 开发

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动静态/本地版开发服务器 |
| `pnpm dev:online` | 启动在线版开发服务器；`/api` 代理到 `127.0.0.1:8787` |
| `pnpm build` | 构建静态版到 `dist/`，并生成 `sw.js` |
| `pnpm build:online` | 构建后端托管的在线版到 `dist-online/`，并生成 `sw.js` |
| `pnpm type` | TypeScript 类型检查 |
| `pnpm lint` | oxlint 检查 |
| `pnpm format` | oxfmt 格式化 |

当前没有自动化测试脚本；提交前请运行 `pnpm type`、`pnpm lint` 和对应的构建。

### 构建配置

[rspack.config.ts](rspack.config.ts) 导出 `createConfig({ apiOrigin, online, devServer })`。`apiOrigin` 默认是 `https://api.deepseek.com`；`online` 选择 `dist-online/` 和 `/api` 开发代理；`devServer` 会合并到 Rspack 开发服务器配置。

- 静态版使用 `rspack.config.ts` 底部的默认导出。
- 在线版使用 [rspack.online.config.ts](rspack.online.config.ts)，其中调用 `createConfig({ online: true })`。
- 静态版需要修改 API 地址时，在配置里传 `apiOrigin`，例如 `createConfig({ apiOrigin: 'https://api.example.com' })`。在线版的聊天、文件和语音请求都走 `/api`，实际上游由服务端的 `DEEPSEEK_API_ORIGIN` 决定。

开发服务器需要通过自定义域名访问时，把域名写入本地 `.dev-hosts` 文件（每行一个或用逗号分隔），或设置 `DEV_ALLOWED_HOSTS`。该文件只保留在本地，不会进入仓库。

### 目录结构

```text
start.bat             Windows 一键启动脚本
src/
  app/                 应用布局、主题与全局样式
  components/          聊天、设置、统计、Markdown 等界面组件
  i18n/                中英文文案
  services/
    api/               API 请求、SSE 与协议类型
    chat/              会话、消息分支、本地存储与历史导入导出
    cloud/             云端备份与云端 API 客户端
    markdown/          Markdown 解析、代码高亮与图表
    online/            在线/离线运行模式与认证
    speech/            录音与朗读
    stats.ts           用量聚合
  pwa/                 manifest、图标与 Service Worker 注册
  utils/               通用工具
scripts/               构建与 PWA Service Worker 工具
server/                可选的 API Key 代理、云端备份与在线版服务
```

可选的云端备份和在线版服务在 [server/](server/README.md)。聊天默认使用 `deepseek-flash`，通过 Anthropic 兼容的 Messages / Files API 通信；语音使用 ASR / TTS 接口。请求使用搜索、链接阅读、标题和 `latest_reminder` 等扩展，接入服务需支持相应能力。附件实际支持的格式以服务端校验为准。

## 许可证

[MIT](LICENSE)。构建会将许可证复制到产物目录，分发时请一并保留；第三方依赖遵循各自的许可证。
