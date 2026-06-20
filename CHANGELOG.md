# Changelog

All notable changes to **Localhost Ports Viewer** are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.0.28] — 2026-06-19

### Fixed
- **Truncated process names** (e.g. a process showing as `app_inkwe`) — names are now resolved in full via `ps-list`, working around `lsof`'s 9-character `COMMAND` limit. Faithful service names across macOS, Linux and Windows.
- **Auto-refresh now works** — the `refreshInterval` setting actually drives a timer; previously it had no effect. Refresh runs only while the panel is visible and restarts when the interval changes.
- **Background refresh is silent** — the loading spinner no longer flashes on every auto-refresh; it only appears on the initial load and on manual refresh.
- **Less noise** — unidentified processes on ephemeral ports (≥ 49152, e.g. random macOS/GUI background apps) are hidden; only recognized dev services on those ports are shown.
- **Docker port cache** keyed by `pid:port` instead of `pid`, so a single Docker proxy serving multiple containers no longer mislabels ports.
- Webview now HTML-escapes process and image names before rendering.
- "See changelog" link in the update popup now points to `CHANGELOG.md` (was a 404).

### Changed
- Windows command line read via `Get-CimInstance Win32_Process` (works on Windows PowerShell 5.1).
- `package.json` read with `fs.readFile` instead of spawning a shell.
- Service identification runs with bounded concurrency for faster refreshes.
- `docker ps` is skipped for 60s after a failure, avoiding repeated timeouts when Docker isn't installed.

---

## [0.0.20] — 2026-03-20

### Changed
- Open source release: added LICENSE (MIT), CONTRIBUTING.md, CODE_OF_CONDUCT.md, GitHub issue templates
- Improved Marketplace page: keywords, categories, badges, full README rewrite

---

## [0.0.19] — 2026-03-20

### Added
- **What's New notification** — shows a summary of changes automatically when the extension is updated, with a link to the full changelog

---

## [0.0.18] — 2026-03-20

### Added
- **Framework detection via `package.json`** — replaces unreliable `ls node_modules`; now reads actual `dependencies` + `devDependencies` for accurate identification
- Detects **Next.js, Nuxt, SvelteKit, Svelte, Remix, Astro, Fastify, Koa, Hapi, Hono, Elysia, Webpack**
- Detects **Spring Boot, Laravel, Rails, Django, FastAPI, Flask, Nginx, Apache, Go, Ruby**
- **Copy port** and **Copy URL** actions per row (clipboard, with ✓ feedback)
- **Kill process** action with confirmation dialog before terminating
- **Search bar** — live filter by port number or service name
- **Quick filter tabs** — All / Node / DB / Web / Other
- **Favorites** — star any port to pin it to the top; persists across restarts
- **Scroll preservation** — auto-refresh no longer jumps the scroll position
- **Loading spinner** overlay during refresh
- **Empty state** with Refresh button when no ports are detected
- **Error state** with "Try again" button on detection failure
- `openBrowserTarget` setting — choose between system browser and VS Code Simple Browser
- Native VS Code CSS variables throughout — works on dark, light, and high-contrast themes
- Activity bar icon switched to SVG for correct rendering

### Changed
- Port list now uses `postMessage` architecture instead of full HTML replacement on each refresh
- Service labels now show framework name directly (e.g. "React" instead of "React (Node.js)")
- Brand colors added for all detected frameworks/services
- Favorites appear at the top of the list, sorted by port number

### Fixed
- React projects being detected as Express when `express` appeared in transitive dependencies
- Activity bar icon appearing as a broken grey square

---

## [0.0.17] — 2025-xx-xx

### Added
- Anti-concurrent refresh (ignores new cycles while one is already running)
- PID cache with 15s TTL to reduce redundant OS calls
- Content Security Policy on the webview
- HTML escaping for all rendered process/framework names
- Configurable `refreshInterval` and `commandTimeout` via settings
- Optional `debugLogs` setting for verbose output in the Output panel
- Port validation before opening URLs

### Changed
- Windows: replaced `wmic` with PowerShell `Get-NetTCPConnection + Get-Process`
- Linux: prioritizes `ss -lntp` with `lsof` fallback
- macOS: standardized parser for `lsof -iTCP -sTCP:LISTEN -P -n`
- Architecture split into OS-specific providers

---

## [0.0.1] — 2024-xx-xx

### Added
- Initial release
- Detects listening TCP ports via `lsof` (macOS/Linux) and `netstat` (Windows)
- Sidebar webview listing port + process name
- One-click open in browser
- Auto-refresh on a fixed interval
