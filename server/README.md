# chat-demo server

在线版 API Key 代理、云端备份和登录服务。

## Setup

```sh
cd server
pnpm install
cp .env.example .env
# 修改 .env
node scripts/hash-password.mjs "your-password"
pnpm dev
```

服务只监听 `127.0.0.1:8787`，由 Caddy 反代。在线版静态文件由 Caddy 从 `dist-online/` 提供。

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | tsx watch 启动 |
| `pnpm start` | 启动服务 |
| `pnpm type` | TypeScript 类型检查 |
| `pnpm hash-password` | 生成 `APP_PASSWORD_HASH` |

## Auth

- 在线版：HttpOnly Cookie
- 本地版跨源同步：登录返回的 Bearer Token
- 本地版同步来源需要在 `ALLOWED_SYNC_ORIGINS` 中；如果通过 `file://` 打开本地版，浏览器发送 `Origin: null`，需要显式允许并确认风险。

## Data

`DATA_DIR` 下保存 `app.db` 和 `files/`（云端图片原件）。建议停服后整体备份，或使用 SQLite backup 再复制 `files/`。
