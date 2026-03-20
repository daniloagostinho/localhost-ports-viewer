# Contributing to Localhost Ports Viewer

Thanks for your interest in contributing! Here's everything you need to get started.

## Table of Contents

- [Reporting bugs](#reporting-bugs)
- [Suggesting features](#suggesting-features)
- [Development setup](#development-setup)
- [Submitting a pull request](#submitting-a-pull-request)
- [Code style](#code-style)

---

## Reporting bugs

Use the [issue templates](.github/ISSUE_TEMPLATE/) that match your OS (macOS, Linux, Windows). Include debug logs when possible — enable them via:

```json
"localhostPortsViewer.debugLogs": true
```

Then reproduce the bug and paste the **Output panel** contents in the issue.

---

## Suggesting features

Open a [feature request](https://github.com/daniloagostinho/localhost-ports-viewer/issues/new?template=feature_request.md) describing the problem you're trying to solve. We prioritize features that benefit cross-platform users.

---

## Development setup

**Requirements:** Node.js 18+, VS Code 1.100+

```bash
# Clone the repo
git clone https://github.com/daniloagostinho/localhost-ports-viewer.git
cd localhost-ports-viewer

# Install dependencies
npm install

# Compile (watch mode)
npm run watch
```

Then press **F5** in VS Code to open an Extension Development Host with the extension loaded.

**Build once:**
```bash
npm run compile
```

**Lint:**
```bash
npm run lint
```

---

## Submitting a pull request

1. Fork the repository
2. Create a branch: `git checkout -b feat/your-feature` or `fix/your-bug`
3. Make your changes following the [code style](#code-style) below
4. Run `npm run compile` and `npm run lint` — both must pass with zero errors
5. Open a PR against `main` with a clear description of what changed and why

**PR checklist:**
- [ ] `npm run compile` passes with no TypeScript errors
- [ ] `npm run lint` passes with no ESLint errors
- [ ] New behavior is tested manually on the target OS
- [ ] No new hardcoded colors (use VS Code CSS variables)
- [ ] No breaking changes to existing settings

---

## Code style

- TypeScript strict mode — no `any`, no implicit returns
- Small, focused functions with a single responsibility
- No over-engineering: solve the problem, don't design for hypotheticals
- VS Code CSS variables for all colors in the webview (no hardcoded hex for chrome)
- Brand colors (React blue, MySQL teal, etc.) are acceptable exceptions

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
