# WebChat

English | [简体中文](README.zh-CN.md)

WebChat is a DeepSeek-powered chat UI. The default build is a static app: conversations and attachments stay in the browser and the browser calls the configured API directly. An optional Node server adds password-protected cloud backup and a server-hosted online mode where the API key never reaches the browser.

## Deployment modes

| Mode | Build | Backend | API key | Conversation storage |
| --- | --- | --- | --- | --- |
| Static / local | `pnpm build` → `dist/` | None; optional [server/](server/README.md) for cloud backup | Entered in Settings, stored in the browser | IndexedDB; optional per-chat cloud backup |
| Server-hosted online | `pnpm build:online` → `dist-online/` | [server/](server/README.md) | `DEEPSEEK_API_KEY` in the server environment | Cloud only; device backups are read-only |

The static build can also use the cloud backup server: sign in under Settings → Cloud and enable sync per conversation.

## Getting started

Requirements: Node.js 22.12+ and pnpm. The server uses `node:sqlite`; use Node.js 24+ for it.

```sh
git clone https://github.com/dynnbw/WebChat.git
# SSH: git clone git@github.com:dynnbw/WebChat.git
cd WebChat
pnpm install
pnpm dev
```

Open http://localhost:8090.

Build the static site:

```sh
pnpm build
```

The output is written to `dist/`. Deploy it to a static web server or open `dist/index.html` directly. Opening the file directly requires browser support for storage on `file://` pages and an API service that permits their cross-origin requests. For cloud sync, `file://` pages send `Origin: null`; prefer serving the app over HTTP instead.

### Server-hosted online mode

Start the backend first:

```sh
cd server
pnpm install
cp .env.example .env
pnpm hash-password "your-password"
# Paste the output into APP_PASSWORD_HASH, then set DEEPSEEK_API_KEY,
# APP_ORIGIN and ALLOWED_SYNC_ORIGINS. For local HTTP set COOKIE_SECURE=0.
pnpm dev
```

Then, from the repository root (run `cd ..` if you are still in `server/`):

```sh
pnpm dev:online
```

Open http://localhost:8090. During development, `/api` is proxied to `127.0.0.1:8787`.

For production, run `pnpm build:online` and serve `dist-online/` from Caddy or another reverse proxy, forwarding `/api/*` to the backend. The backend listens on `127.0.0.1` only. See [server/README.md](server/README.md) and [server/Caddyfile.example](server/Caddyfile.example) for the full configuration.

The online build stores the online/offline choice in localStorage. Use “Use offline” on the login screen, or Settings → General → Switch to offline; switching reloads the page. Offline history uses the same-origin IndexedDB.

### One-click start on Windows

Double-click [start.bat](start.bat), or run it from a terminal:

```bat
start.bat
start.bat local
```

This launcher runs the development servers. With no argument, it starts the online stack when `server/.env` exists, otherwise the local static frontend. Online mode starts the backend and the online frontend, installs missing dependencies, and opens http://localhost:8090. If both ports are already listening, it opens the page without starting duplicates. Use `start.bat online` or `start.bat local` to choose explicitly. For production, use the build and deployment steps above.

## Features

- Multiple conversations with automatic titles, renaming, and deletion; edit prompts, regenerate replies, and switch between message branches.
- Streaming replies, deep thinking, smart search, link reading, and source citations; stop generation or continue eligible replies.
- Upload, paste, or drag and drop attachments; use voice input and read replies aloud. A live audio spectrum appears in the first row of the input area while recording on mobile.
- Automatic read-aloud from the top-left toggle, with a choice between reading after completion and reading while streaming.
- Markdown, syntax highlighting, KaTeX math, and Mermaid diagrams.
- Custom system prompt and switchable models; safety-blocked replies show a sensitive-content notice with an expandable original.
- Usage statistics for API requests, search calls, and token usage over time, split by model and available in both local and online modes.
- Optional per-chat cloud backup, plus a server-hosted online mode with a server-side API key. Device backups are read-only; an online chat can be created from a backup and the backup is then removed.
- Runtime online/offline switch in the server-hosted build, so the same origin can be used with either cloud or local history.
- Installable PWA: production builds ship a manifest, icons, and a service worker that caches the app shell. API and cloud requests are never cached.
- Simplified Chinese and English, light and dark themes, mobile layouts, location settings, and chat history import and export.

## Data and storage

### Local / static build

- API key, language, theme, system prompt, model, read-aloud settings, cloud URL, and cloud token are stored in the browser's localStorage.
- Conversations and original attachments are stored in IndexedDB.
- Local data is isolated by browser profile and site origin.
- Settings → Data → Import / Export uses ZIP archives. Importing replaces all local conversations and attachments after confirmation and validation. Exports include conversations and locally available original images, but exclude API keys, settings, and original non-image attachments. Existing cloud backups are not deleted by an import. See the [history import/export documentation (Chinese)](src/services/chat/history/README.md).
- Settings → Data → Delete all chats clears local conversations, original attachments, and unsent drafts after confirmation. The API key and settings are preserved; files already uploaded to the API service are not deleted, and existing cloud backups are not deleted.

### Cloud backup and online mode

- Cloud data is stored by the backend in `DATA_DIR/app.db` (SQLite) and `DATA_DIR/files/` (image originals). Conversations are stored as complete session JSON.
- Only image originals are uploaded to the cloud. Other attachments keep their metadata, so they can be displayed but not opened from another device.
- For cloud sync from the static build, add that app's exact origin to `ALLOWED_SYNC_ORIGINS` on the server.
- Enable sync per conversation from the conversation menu. The first upload happens immediately; later changes upload after a short debounce once a reply is complete.
- Online uploads are capped by the server's `MAX_FILE_BYTES`; the effective limit can be lower than the local build's client-side limit.
- Turning off sync or deleting the local conversation does not delete the cloud copy. A device backup can only be deleted from the online mode.
- Online mode shows device backups as read-only. The conversation menu can convert a backup to an editable online chat; conversion removes the cloud backup and stops automatic sync of the same-origin offline copy.
- Online chats are cloud-only and are saved after each completed reply and other key changes. There is no two-way sync, conflict merge, or settings sync.
- The online build uses a server-side API key. Users sign in with the server password; the API key is never sent to the browser.
- The server is a single-password deployment, not a multi-user account system. Everyone who knows the password shares the same cloud history and API key quota.
- Settings in online mode only exposes General. History import/export and Delete all chats are local-mode features. To populate the cloud from an existing ZIP, switch to offline mode on the same origin, import the history, enable sync on the conversations you want, then switch back to online.
- The server does not encrypt the SQLite database or image files at rest. Protect `DATA_DIR`, use HTTPS, and keep the server behind a reverse proxy.

Sending messages, uploading attachments, and using speech features sends the relevant content to the configured API service. In online mode those requests pass through the backend proxy.

### PWA and offline behavior

- `pnpm build` and `pnpm build:online` also generate `sw.js` alongside the manifest and icons.
- Installation requires HTTPS or localhost; `file://` pages cannot register a service worker.
- The service worker caches the app shell and static build assets. It does not cache `/api`, cloud conversations, or cross-origin API requests.
- A local/static install can open and use IndexedDB history offline; sending messages still requires network access.
- An online install can open the shell offline, but cloud history is unavailable. The login error screen offers “Use offline” to switch to local mode.
- New service worker versions wait for old pages to close, so updates apply on a later launch. Development servers do not register a service worker.
- To test installation and offline behavior, serve `dist/` or `dist-online/` over localhost or HTTPS.

## Development

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the static/local development server |
| `pnpm dev:online` | Start the online build; proxies `/api` to `127.0.0.1:8787` |
| `pnpm build` | Build the static app into `dist/` and generate `sw.js` |
| `pnpm build:online` | Build the server-hosted app into `dist-online/` and generate `sw.js` |
| `pnpm type` | Run TypeScript type checks |
| `pnpm lint` | Lint with oxlint |
| `pnpm format` | Format with oxfmt |

There is no automated test script; run `pnpm type`, `pnpm lint`, and the relevant build before submitting changes.

### Build configuration

[rspack.config.ts](rspack.config.ts) exports `createConfig({ apiOrigin, online, devServer })`. The default API origin is `https://api.deepseek.com`; `online` selects `dist-online/` and the `/api` development proxy; `devServer` is merged into the Rspack dev server options.

- The static build uses the default export at the bottom of `rspack.config.ts`.
- The online build uses [rspack.online.config.ts](rspack.online.config.ts), which calls `createConfig({ online: true })`.
- To change the API origin for the static build, pass `apiOrigin`, for example `createConfig({ apiOrigin: 'https://api.example.com' })`. In the online build, chat, file, and speech requests go through `/api`, so the effective upstream is the server's `DEEPSEEK_API_ORIGIN` instead.

To access the development server through a custom hostname, add it to a local `.dev-hosts` file (one per line or comma-separated) or set `DEV_ALLOWED_HOSTS`. The file is local-only and is not tracked.

### Project layout

```text
start.bat             Windows one-click launcher
src/
  app/                 Application layout, themes, and global styles
  components/          Chat, settings, stats, Markdown, and other UI components
  i18n/                English and Chinese translations
  services/
    api/               API requests, SSE, and protocol types
    chat/              Conversations, message branches, storage, and history import/export
    cloud/             Cloud backup and cloud API client
    markdown/          Markdown parsing, syntax highlighting, and diagrams
    online/            Online/local runtime mode and authentication
    speech/            Audio recording and read-aloud playback
    stats.ts           Usage aggregation
  pwa/                 Manifest, icons, and service worker registration
  utils/               Shared utilities
scripts/               Build and PWA service worker tooling
server/                Optional API key proxy, cloud backup, and online-mode server
```

The optional backend lives in [server/](server/README.md). Chat uses `deepseek-flash` by default through Anthropic-compatible Messages / Files APIs. Speech features use ASR / TTS endpoints. Requests include extensions for search, link reading, titles, and `latest_reminder`, so the configured service must support the corresponding capabilities. Supported attachment formats are determined by server-side validation.

## License

[MIT](LICENSE). The build copies the license into the output directory; include it when distributing the app. Third-party dependencies are subject to their own licenses.
