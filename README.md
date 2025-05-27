# Localhost Ports Viewer

![VS Code Version](https://img.shields.io/badge/VSCode-1.100+-blue?logo=visualstudiocode)
![Version](https://img.shields.io/badge/version-0.0.1-green)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)

> Effortlessly view and open services running on your `localhost` directly from the VS Code sidebar.

---

## ✨ Features

- ✅ Detects all open TCP ports listening on `localhost`
- 🌐 Displays process names like `node`, `postgres`, `python`, etc.
- 🚀 One-click button to open `http://localhost:<port>` in your default browser
- 💻 Cross-platform support (macOS, Linux, Windows)
- 🎯 Sleek native sidebar integration with premium UX

---

## 📸 Preview

> *(You can add a GIF or screenshot here)*

---

## 🧩 How It Works

This extension uses system-level commands:

- `lsof` on macOS/Linux
- `netstat` on Windows

to detect listening ports, then lists them in the **Activity Bar**, showing process name and port side-by-side.

Clicking on any item instantly opens that URL in your default browser.

---

## 📦 Installation

Search for `Localhost Ports Viewer` in the [VS Code Marketplace](https://marketplace.visualstudio.com/)  
or install via command line:

```bash
code --install-extension daniloagostinho.localhost-ports-viewer
