// VS Code extension: Localhost Ports Viewer

import { exec } from 'child_process';
import { platform } from 'os';
import tcpPortUsed from 'tcp-port-used';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

// ─── Types ───────────────────────────────────────────────────────────────────

interface PortInfo {
  port: string;
  process: string;
  framework?: string;
}

interface ServiceInfo {
  framework?: string;
  platform: string;
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function getConfig() {
  return vscode.workspace.getConfiguration('localhostPortsViewer');
}

function debugLog(msg: string, ...args: unknown[]) {
  if (getConfig().get<boolean>('debugLogs', false)) {
    console.log(`[LocalhostPortsViewer] ${msg}`, ...args);
  }
}

// ─── execWithTimeout ──────────────────────────────────────────────────────────

async function execWithTimeout(cmd: string, timeoutMs?: number): Promise<string> {
  const ms = timeoutMs ?? getConfig().get<number>('commandTimeout', 5000);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Command timed out after ${ms}ms: ${cmd}`)), ms)
  );
  const run = execAsync(cmd).then(r => r.stdout);
  return Promise.race([run, timeout]);
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Port validation ──────────────────────────────────────────────────────────

function isValidPort(value: unknown): value is string {
  const num = parseInt(String(value), 10);
  return Number.isInteger(num) && num >= 1 && num <= 65535;
}

// ─── PID cache ────────────────────────────────────────────────────────────────

interface CacheEntry {
  serviceInfo: ServiceInfo;
  expiresAt: number;
}

const pidCache = new Map<string, CacheEntry>();
const PID_CACHE_TTL_MS = 15_000;

function getCachedService(pid: string): ServiceInfo | undefined {
  const entry = pidCache.get(pid);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.serviceInfo;
  }
  pidCache.delete(pid);
  return undefined;
}

function setCachedService(pid: string, serviceInfo: ServiceInfo): void {
  pidCache.set(pid, { serviceInfo, expiresAt: Date.now() + PID_CACHE_TTL_MS });
}

// ─── Process command getters ──────────────────────────────────────────────────

async function getProcessCommandWindows(pid: string): Promise<string> {
  try {
    const ps = `powershell -NoProfile -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CommandLine"`;
    const out = await execWithTimeout(ps);
    if (out.trim()) { return out.toLowerCase(); }
  } catch {}
  try {
    return (await execWithTimeout(`tasklist /v /fi "PID eq ${pid}"`)).toLowerCase();
  } catch {}
  return '';
}

async function getProcessCommandUnix(pid: string): Promise<string> {
  try {
    return (await execWithTimeout(`ps -p ${pid} -o command= -o args= -o comm=`)).toLowerCase();
  } catch {}
  try {
    return (await execWithTimeout(`ps aux | grep ${pid} | grep -v grep`)).toLowerCase();
  } catch {}
  try {
    const [cmdline, environ] = await Promise.all([
      execWithTimeout(`cat /proc/${pid}/cmdline`),
      execWithTimeout(`cat /proc/${pid}/environ`),
    ]);
    return `${cmdline} ${environ}`.toLowerCase();
  } catch {}
  return '';
}

async function getProcessCommand(pid: string, isWindows: boolean): Promise<string> {
  return isWindows ? getProcessCommandWindows(pid) : getProcessCommandUnix(pid);
}

// ─── Node modules detection ───────────────────────────────────────────────────

async function getNodeModulesWindows(pid: string): Promise<string[]> {
  try {
    const ps = `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path"`;
    const exePath = (await execWithTimeout(ps)).trim();
    if (exePath) {
      const dir = exePath.substring(0, exePath.lastIndexOf('\\'));
      const modules = await execWithTimeout(`dir "${dir}\\node_modules" /b`);
      return modules.split('\n').map(m => m.trim().toLowerCase()).filter(Boolean);
    }
  } catch {}
  return [];
}

async function getNodeModulesUnix(pid: string): Promise<string[]> {
  try {
    const pwdOutput = await execWithTimeout(`lsof -p ${pid} | grep cwd`);
    const workingDir = pwdOutput.split(/\s+/)[8];
    if (workingDir) {
      const modules = await execWithTimeout(`ls ${workingDir}/node_modules`);
      return modules.split('\n').map(m => m.trim().toLowerCase()).filter(Boolean);
    }
  } catch {}
  return [];
}

async function getNodeModules(pid: string, isWindows: boolean): Promise<string[]> {
  return isWindows ? getNodeModulesWindows(pid) : getNodeModulesUnix(pid);
}

// ─── Service identification ───────────────────────────────────────────────────

const FRAMEWORK_PATTERNS: Record<string, { cmd: string[]; modules: string[] }> = {
  Angular: {
    cmd:     ['ng serve', '@angular/cli', '@angular-devkit', 'angular.json'],
    modules: ['@angular/core', '@angular/cli', '@angular-devkit'],
  },
  React: {
    cmd:     ['react-scripts', 'create-react-app', 'next dev', 'vite'],
    modules: ['react', 'react-dom', 'react-scripts', 'next', '@vitejs'],
  },
  Vue: {
    cmd:     ['vue-cli-service', '@vue/cli', 'nuxt'],
    modules: ['vue', '@vue/cli-service', 'nuxt'],
  },
  Nx: {
    cmd:     ['nx serve', '@nrwl/cli'],
    modules: ['@nrwl/workspace', '@nrwl/cli'],
  },
  Express: {
    cmd:     ['express', 'node server'],
    modules: ['express'],
  },
  NestJS: {
    cmd:     ['nest start', '@nestjs'],
    modules: ['@nestjs/core'],
  },
};

const SERVICE_PATTERNS: Array<{ name: string; patterns: string[] }> = [
  { name: 'PostgreSQL', patterns: ['postgres', 'postgresql', 'psql'] },
  { name: 'MySQL',      patterns: ['mysqld', 'mysql.server', 'mariadb'] },
  { name: 'MongoDB',    patterns: ['mongod', 'mongodb'] },
  { name: 'Redis',      patterns: ['redis-server'] },
  { name: 'Java',       patterns: ['java', 'javaw', '.jar', 'spring-boot', 'tomcat'] },
  { name: 'Python',     patterns: ['python', 'flask', 'django', 'uvicorn', 'gunicorn'] },
  { name: 'PHP',        patterns: ['php', 'apache2', 'nginx', 'artisan', 'symfony'] },
];

async function identifyService(processName: string, pid: string, isWindows: boolean): Promise<ServiceInfo> {
  const cached = getCachedService(pid);
  if (cached) { return cached; }

  try {
    const cmd = await getProcessCommand(pid, isWindows);
    const nameLower = processName.toLowerCase();

    if (cmd.includes('node') || nameLower.includes('node')) {
      const nodeModules = await getNodeModules(pid, isWindows);
      for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
        const hasCmdPattern = patterns.cmd.some(p => cmd.includes(p));
        const hasModule     = patterns.modules.some(m => nodeModules.includes(m));
        if (hasCmdPattern || hasModule) {
          const result: ServiceInfo = { framework, platform: 'Node.js' };
          setCachedService(pid, result);
          return result;
        }
      }
      const result: ServiceInfo = { platform: 'Node.js' };
      setCachedService(pid, result);
      return result;
    }

    for (const svc of SERVICE_PATTERNS) {
      if (svc.patterns.some(p => cmd.includes(p) || processName.toLowerCase().includes(p))) {
        const result: ServiceInfo = { platform: svc.name };
        setCachedService(pid, result);
        return result;
      }
    }
  } catch (err) {
    debugLog('Error identifying service for PID %s: %o', pid, err);
  }

  const result: ServiceInfo = { platform: processName };
  setCachedService(pid, result);
  return result;
}

// ─── OS-specific port collectors ─────────────────────────────────────────────

async function collectPortsWindows(): Promise<PortInfo[]> {
  debugLog('Collecting ports via PowerShell (Windows)');
  const ps = [
    'Get-NetTCPConnection -State Listen',
    '| Select-Object LocalPort,OwningProcess',
    '| ForEach-Object {',
    '  $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue;',
    '  "$($_.LocalPort) $($_.OwningProcess) $($proc.ProcessName)"',
    '}',
  ].join(' ');
  const output = await execWithTimeout(`powershell -NoProfile -Command "${ps}"`, 10_000);

  const result: PortInfo[] = [];
  const portSet = new Set<string>();

  for (const line of output.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) { continue; }
    const [port, pid, procName = 'PORT IN USE'] = parts;
    if (!portSet.has(port)) {
      portSet.add(port);
      const serviceInfo = await identifyService(procName, pid, true);
      result.push({ port, process: serviceInfo.platform, framework: serviceInfo.framework });
    }
  }
  return result;
}

async function parseLsofLines(lines: string[], isWindows: boolean): Promise<PortInfo[]> {
  const result: PortInfo[] = [];
  const portSet = new Set<string>();

  for (const line of lines) {
    if (!line.trim()) { continue; }
    const portMatch = line.match(/[.:](\d+)\s+\(LISTEN\)/);
    const parts = line.split(/\s+/);
    if (!portMatch || parts.length < 2) { continue; }
    const port = portMatch[1];
    if (portSet.has(port)) { continue; }
    portSet.add(port);
    const serviceInfo = await identifyService(parts[0], parts[1], isWindows);
    result.push({ port, process: serviceInfo.platform, framework: serviceInfo.framework });
  }
  return result;
}

async function collectPortsMacOS(): Promise<PortInfo[]> {
  debugLog('Collecting ports via lsof (macOS)');
  const output = await execWithTimeout('lsof -iTCP -sTCP:LISTEN -P -n');
  return parseLsofLines(output.split('\n'), false);
}

async function parseSsLines(lines: string[]): Promise<PortInfo[]> {
  const result: PortInfo[] = [];
  const portSet = new Set<string>();

  for (const line of lines) {
    if (!line.includes('LISTEN')) { continue; }
    const portMatch = line.match(/:(\d+)\s+/);
    if (!portMatch) { continue; }
    const port = portMatch[1];
    if (portSet.has(port)) { continue; }
    portSet.add(port);

    const pidMatch  = line.match(/pid=(\d+)/);
    const nameMatch = line.match(/\("([^"]+)"/);
    const pid       = pidMatch?.[1]  ?? '';
    const procName  = nameMatch?.[1] ?? 'PORT IN USE';

    if (pid) {
      const serviceInfo = await identifyService(procName, pid, false);
      result.push({ port, process: serviceInfo.platform, framework: serviceInfo.framework });
    } else {
      result.push({ port, process: procName });
    }
  }
  return result;
}

async function collectPortsLinux(): Promise<PortInfo[]> {
  try {
    debugLog('Collecting ports via ss (Linux)');
    const output = await execWithTimeout('ss -lntp');
    return parseSsLines(output.split('\n'));
  } catch {
    debugLog('ss failed, falling back to lsof');
    const output = await execWithTimeout('lsof -i TCP -P -n | grep LISTEN');
    return parseLsofLines(output.split('\n'), false);
  }
}

// ─── Fallback (common ports only) ────────────────────────────────────────────

const COMMON_PORTS: Array<{ port: number; info: ServiceInfo }> = [
  { port: 3000,  info: { framework: 'React/Node', platform: 'Node.js' } },
  { port: 3001,  info: { platform: 'Node.js' } },
  { port: 4200,  info: { framework: 'Angular', platform: 'Node.js' } },
  { port: 5000,  info: { platform: 'Node.js' } },
  { port: 5173,  info: { framework: 'Vite', platform: 'Node.js' } },
  { port: 8000,  info: { platform: 'Node.js/Python' } },
  { port: 8080,  info: { platform: 'Java' } },
  { port: 5432,  info: { platform: 'PostgreSQL' } },
  { port: 3306,  info: { platform: 'MySQL' } },
  { port: 27017, info: { platform: 'MongoDB' } },
  { port: 6379,  info: { platform: 'Redis' } },
];

async function collectPortsFallback(): Promise<PortInfo[]> {
  debugLog('Using fallback port detection (common ports only)');
  const results: PortInfo[] = [];
  await Promise.all(
    COMMON_PORTS.map(async ({ port, info }) => {
      try {
        const [v4, v6] = await Promise.all([
          tcpPortUsed.check(port, '127.0.0.1'),
          tcpPortUsed.check(port, '::1'),
        ]);
        if (v4 || v6) {
          results.push({ port: port.toString(), process: info.platform, framework: info.framework });
        }
      } catch {}
    })
  );
  return results;
}

// ─── Main port collector ──────────────────────────────────────────────────────

async function getListeningPorts(): Promise<PortInfo[]> {
  const os = platform();
  let ports: PortInfo[] = [];

  try {
    if (os === 'win32') {
      ports = await collectPortsWindows();
    } else if (os === 'darwin') {
      ports = await collectPortsMacOS();
    } else {
      ports = await collectPortsLinux();
    }
  } catch (err) {
    debugLog('Primary port collection failed: %o', err);
  }

  if (ports.length === 0) {
    ports = await collectPortsFallback();
  }

  return ports.sort((a, b) => parseInt(a.port) - parseInt(b.port));
}

// ─── Webview HTML ─────────────────────────────────────────────────────────────

function getWebviewContent(ports: PortInfo[]): string {
  const nonce = generateNonce();

  const rows = ports.map(p => {
    const serviceClass  = p.process.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const serviceDisplay = p.framework
      ? `${escapeHtml(p.framework)} (${escapeHtml(p.process)})`
      : escapeHtml(p.process);
    const safePort = escapeHtml(p.port);

    return `
    <div class="row">
      <div class="port-info">
        <div class="port">${safePort}</div>
        <div class="service ${serviceClass}">${serviceDisplay}</div>
      </div>
      <button class="open-btn" data-port="${safePort}">
        <span class="arrow">→</span>
        <span class="tooltip">Open in browser</span>
      </button>
    </div>`;
  }).join('\n');

  const emptyState = ports.length === 0
    ? `<div class="empty-state">No active ports detected</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    body {
      background-color: #1e1e1e;
      color: #ccc;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 16px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .refresh-btn {
      background-color: #2d2d2d;
      color: #ccc;
      border: 1px solid #3d3d3d;
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      transition: all 0.2s ease;
    }
    .refresh-btn:hover { background-color: #3d3d3d; color: white; }
    .refresh-icon { font-size: 14px; }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      background: #252525;
      padding: 8px 12px;
      border-radius: 8px;
      transition: all 0.2s ease;
    }
    .row:hover { background: #2d2d2d; }
    .port-info { display: flex; align-items: center; gap: 12px; }
    .port {
      background-color: #2ea043;
      color: white;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 14px;
      min-width: 50px;
      text-align: center;
    }
    .service {
      font-size: 12px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      background: #333;
    }
    .angular    { background-color: #dd0031; color: white; }
    .react      { background-color: #61dafb; color: black; }
    .vue        { background-color: #42b883; color: white; }
    .node-js    { background-color: #68a063; color: white; }
    .postgresql { background-color: #336791; color: white; }
    .mysql      { background-color: #00758f; color: white; }
    .mongodb    { background-color: #4db33d; color: white; }
    .redis      { background-color: #d82c20; color: white; }
    .java       { background-color: #007396; color: white; }
    .python     { background-color: #3776ab; color: white; }
    .php        { background-color: #777bb3; color: white; }
    .port-in-use { background-color: #6e7681; color: white; }
    .open-btn {
      background: none;
      border: none;
      color: #ccc;
      font-size: 18px;
      cursor: pointer;
      padding: 6px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 4px;
      transition: all 0.2s ease;
    }
    .open-btn:hover { background-color: #3d3d3d; color: white; }
    .open-btn .arrow { transition: transform 0.2s ease; }
    .open-btn:hover .arrow { transform: translateX(2px); }
    .tooltip {
      position: absolute;
      background: #3d3d3d;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      right: 100%;
      margin-right: 8px;
      opacity: 0;
      visibility: hidden;
      transition: all 0.2s ease;
    }
    .open-btn:hover .tooltip { opacity: 1; visibility: visible; }
    .empty-state {
      color: #666;
      text-align: center;
      padding: 32px 0;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h3>ACTIVE PORTS</h3>
    <button class="refresh-btn" id="refresh-btn">
      <span class="refresh-icon">↻</span>
      Synchronize
    </button>
  </div>
  ${rows}
  ${emptyState}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('refresh-btn').addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
    });

    document.querySelectorAll('.open-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const port = btn.getAttribute('data-port');
        if (port) { vscode.postMessage({ command: 'open', port }); }
      });
    });
  </script>
</body>
</html>`;
}

// ─── Extension ────────────────────────────────────────────────────────────────

class LocalhostPortsWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _refreshInterval?: NodeJS.Timeout;
  private _isRefreshing = false;

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = { enableScripts: true };

    this.startAutoRefresh();
    await this.updateContent();

    webviewView.onDidDispose(() => this.stopAutoRefresh());

    webviewView.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'open': {
          if (!isValidPort(msg.port)) {
            debugLog('Rejected invalid port value: %s', msg.port);
            return;
          }
          vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${msg.port}`));
          break;
        }
        case 'refresh':
          this.updateContent();
          break;
      }
    });
  }

  private startAutoRefresh() {
    this.stopAutoRefresh();
    const interval = getConfig().get<number>('refreshInterval', 5000);
    this._refreshInterval = setInterval(() => this.updateContent(), interval);
  }

  private stopAutoRefresh() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = undefined;
    }
  }

  private async updateContent() {
    if (this._isRefreshing || !this._view) { return; }
    this._isRefreshing = true;
    try {
      const ports = await getListeningPorts();
      if (this._view) {
        this._view.webview.html = getWebviewContent(ports);
      }
    } catch (err) {
      debugLog('updateContent error: %o', err);
    } finally {
      this._isRefreshing = false;
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new LocalhostPortsWebviewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('localhostPorts', provider)
  );
}

export function deactivate() {}
