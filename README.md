# 🌐 Localhost Ports Viewer

[![Version](https://img.shields.io/visual-studio-marketplace/v/danilodevsilva.localhost-ports-viewer?label=version&color=blue)](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.localhost-ports-viewer)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/danilodevsilva.localhost-ports-viewer?color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.localhost-ports-viewer)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.100+-blue?logo=visualstudiocode)](https://code.visualstudio.com/)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.localhost-ports-viewer)

> **See every service running on your machine — without leaving VS Code.**
> Open, copy, or kill any localhost port directly from the sidebar.

---

## 💡 Why Localhost Ports Viewer?

When you're running multiple services at once — a React frontend, a Node API, a database, Docker containers — keeping track of which port is which is a pain. This extension puts all active localhost services in one place, right inside VS Code, with automatic framework detection and Docker container awareness.

No more `lsof -i | grep LISTEN`. No more forgotten ports.

---

## ✨ Features

### 📡 Real-time port monitoring

All TCP ports currently listening on your machine, updated automatically. No manual refresh needed.

### 🔍 Automatic framework & service detection

Identifies what's running on each port using multiple detection strategies: process name, command line analysis, `package.json` reading, and HTTP response fingerprinting.

| Category | Detected |
|---|---|
| **Frontend** | React, Next.js, Vue, Nuxt, Angular, Svelte, SvelteKit, Astro, Remix, Vite, Webpack |
| **Backend (Node)** | Express, Fastify, NestJS, Koa, Hapi, Hono, Elysia, Nx |
| **Backend (Other)** | Spring Boot, Java/Tomcat, Laravel, Rails (Puma/Unicorn), Django, FastAPI, Flask, Go, PHP/Symfony, Ruby, Gunicorn |
| **Databases** | PostgreSQL, MySQL/MariaDB, MongoDB, Redis, Cassandra, SQLite |
| **Web Servers** | Nginx, Apache |

### 🐳 Docker container detection

Automatically detects ports exposed by Docker containers and shows the container image name with a whale icon instead of a generic process name.

- Runs `docker ps` to map host ports to container names and images
- Recognizes known services inside containers (e.g., `postgres:16-alpine` shows as `PostgreSQL`)
- Dedicated **Docker** filter tab to quickly see only containerized services

![Docker container detection](preview-docker.png)

### 🌍 HTTP framework fingerprinting

When process-level detection isn't enough, the extension probes HTTP ports to detect frameworks by analyzing response headers and HTML markers — identifying Next.js, Nuxt, Remix, Astro, SvelteKit, Angular, Vite, and React.

### 🖱️ One-click actions (hover a port to reveal)

- **↗ Open** — opens `http://localhost:<port>` in the browser (system default or VS Code Simple Browser)
- **⎘ Copy port** — copies just the port number to clipboard
- **🔗 Copy URL** — copies the full `http://localhost:<port>` URL
- **✕ Kill** — terminates the process with a confirmation dialog

### 🔎 Search & filter

- Type to filter by port number or service name
- Quick tabs: **All · Node · DB · Web · Docker · Other**

### ⭐ Favorites

Star any port to pin it to the top with a gold highlight — persisted across restarts.

### 🛡️ Smart system process filtering

Automatically hides IDE internals (VS Code helpers, Electron, JetBrains IDEs) and OS services so you only see what matters for development.

### 🎨 Native VS Code theming

Fully adapts to any theme: dark, light, high contrast. Uses VS Code CSS variables throughout.

---

## 📸 Preview

![Localhost Ports Viewer preview](preview.gif)

> *Hover over any row to reveal the action buttons.*

---

## ⚙️ Settings

| Setting | Default | Description |
|---|---|---|
| `localhostPortsViewer.refreshInterval` | `5000` | Auto-refresh interval in ms (min 1000) |
| `localhostPortsViewer.commandTimeout` | `5000` | Timeout per OS command in ms |
| `localhostPortsViewer.openBrowserTarget` | `"external"` | `"external"` = system browser · `"internal"` = VS Code Simple Browser |
| `localhostPortsViewer.debugLogs` | `false` | Enable verbose logs in the Output panel |

---

## 🧠 How It Works

The extension uses OS-level commands to list listening TCP ports:

- **macOS**: `lsof -iTCP -sTCP:LISTEN`
- **Linux**: `ss -lntp` (fallback: `lsof`)
- **Windows**: PowerShell `Get-NetTCPConnection`

For each port, it applies a multi-layer identification strategy:

1. **Process name matching** — checks the process name against known service patterns
2. **Command line analysis** — reads the full command for deeper framework clues
3. **`package.json` detection** — for Node processes, reads project dependencies to identify React, Next.js, Vue, etc.
4. **🐳 Docker container resolution** — queries `docker ps` to map container ports to image names
5. **HTTP fingerprinting** — probes HTTP ports to detect frameworks from response headers and HTML content

Results are cached per-PID (15s TTL) to keep refreshes fast.

---

## 🚀 Installation

Search **Localhost Ports Viewer** in the VS Code Extensions panel, or:

```bash
code --install-extension danilodevsilva.localhost-ports-viewer
```

After installing, click the **wifi icon** in the Activity Bar on the left.

---

## 💬 Feedback & Issues

Found a bug or have a feature request? [Open an issue on GitHub](https://github.com/daniloagostinho/localhost-ports-viewer/issues).

If this extension saves you time, consider leaving a ⭐ [review on the Marketplace](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.localhost-ports-viewer&ssr=false#review-details) — it really helps!

---

## 📄 License

[MIT](LICENSE.txt)
