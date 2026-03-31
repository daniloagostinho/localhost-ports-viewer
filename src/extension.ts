// Copyright (c) 2024 Danilo Silva (daniloagostinho)
// Licensed under the MIT License. See LICENSE in the project root.
// VS Code extension: Localhost Ports Viewer

import { exec } from 'child_process';
import * as http from 'http';
import { platform } from 'os';
import tcpPortUsed from 'tcp-port-used';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortInfo {
  port: string;
  pid: string;
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

// ─── HTTP framework fingerprinting ───────────────────────────────────────────

// Ports that are never HTTP — skip probing them
const NON_HTTP_PORTS = new Set(['5432', '3306', '27017', '6379', '5672', '6380', '6381', '11211']);

const httpCache = new Map<string, { framework: string | undefined; expiresAt: number }>();

function detectFrameworkFromHttp(poweredBy: string, body: string): string | undefined {
  if (poweredBy.includes('next.js'))                                               { return 'Next.js'; }

  if (body.includes('window.__NUXT__')   || body.includes('/__nuxt/'))            { return 'Nuxt'; }
  if (body.includes('window.__remixContext'))                                      { return 'Remix'; }
  if (body.includes('data-astro-cid')    || body.includes('/_astro/'))            { return 'Astro'; }
  if (body.includes('/__sveltekit/')     || body.includes('/_app/immutable'))     { return 'SvelteKit'; }
  if (body.includes('window.__NEXT_DATA__') || body.includes('__NEXT_DATA__'))    { return 'Next.js'; }
  if (body.includes('ng-version')        || body.includes('<app-root'))           { return 'Angular'; }
  if (body.includes('/@vite/client'))                                              { return 'Vite'; }
  if (body.includes('/static/js/main.')  || body.includes('react-scripts'))       { return 'React'; }

  return undefined;
}

async function probeHttpFramework(port: string): Promise<string | undefined> {
  if (NON_HTTP_PORTS.has(port)) { return undefined; }

  const cached = httpCache.get(port);
  if (cached && Date.now() < cached.expiresAt) { return cached.framework; }

  return new Promise<string | undefined>((resolve) => {
    function done(framework: string | undefined) {
      httpCache.set(port, { framework, expiresAt: Date.now() + PID_CACHE_TTL_MS });
      resolve(framework);
    }

    const req = http.get(
      { hostname: '127.0.0.1', port: parseInt(port, 10), path: '/', timeout: 600,
        headers: { 'User-Agent': 'localhost-ports-viewer/probe' } },
      (res) => {
        const poweredBy = String(res.headers['x-powered-by'] ?? '').toLowerCase();

        // Next.js identified by header alone — no need to read body
        if (poweredBy.includes('next.js')) { res.destroy(); return done('Next.js'); }

        // Collect first 8 KB of body
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          bytes += chunk.length;
          if (bytes >= 8192) { res.destroy(); }
        });
        res.on('close', () => {
          const body = Buffer.concat(chunks).toString('utf8', 0, Math.min(bytes, 8192));
          done(detectFrameworkFromHttp(poweredBy, body));
        });
        res.on('error', () => done(undefined));
      }
    );

    req.on('timeout', () => { req.destroy(); done(undefined); });
    req.on('error',   () => done(undefined));
  });
}

// ─── Process command getters ──────────────────────────────────────────────────

// getRawCommand preserves original case (needed for path extraction)
async function getRawCommandWindows(pid: string): Promise<string> {
  try {
    const ps = `powershell -NoProfile -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CommandLine"`;
    const out = await execWithTimeout(ps);
    if (out.trim()) { return out.trim(); }
  } catch {}
  try {
    return (await execWithTimeout(`tasklist /v /fi "PID eq ${pid}"`)).trim();
  } catch {}
  return '';
}

async function getRawCommandUnix(pid: string): Promise<string> {
  try {
    return (await execWithTimeout(`ps -p ${pid} -o args=`)).trim();
  } catch {}
  try {
    return (await execWithTimeout(`ps aux | grep "^[^ ]*[ ]*${pid} " | grep -v grep`)).trim();
  } catch {}
  return '';
}

async function getRawCommand(pid: string, isWindows: boolean): Promise<string> {
  return isWindows ? getRawCommandWindows(pid) : getRawCommandUnix(pid);
}

// ─── Working directory ────────────────────────────────────────────────────────

async function getWorkingDirUnix(pid: string): Promise<string> {
  try {
    // -Fn outputs field names; lines starting with 'n' are file names (paths)
    // -a -d cwd restricts to the cwd file descriptor only
    const out = await execWithTimeout(`lsof -p ${pid} -a -d cwd -Fn 2>/dev/null`);
    const line = out.split('\n').find(l => l.startsWith('n'));
    if (line && line.length > 1) { return line.slice(1).trim(); }
  } catch {}
  try {
    return (await execWithTimeout(`readlink /proc/${pid}/cwd`)).trim();
  } catch {}
  return '';
}

async function getWorkingDirWindows(pid: string): Promise<string> {
  try {
    const ps = `powershell -NoProfile -Command "Split-Path (Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path"`;
    return (await execWithTimeout(ps)).trim();
  } catch {}
  return '';
}

function getWorkingDir(pid: string, isWindows: boolean): Promise<string> {
  return isWindows ? getWorkingDirWindows(pid) : getWorkingDirUnix(pid);
}

// ─── Package.json reader ──────────────────────────────────────────────────────

interface PkgInfo { deps: string[] }

async function readPkgInfo(cwd: string): Promise<PkgInfo> {
  try {
    const raw = await execWithTimeout(`cat "${cwd}/package.json"`);
    const pkg = JSON.parse(raw);
    return {
      deps: [
        ...Object.keys(pkg.dependencies    || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ],
    };
  } catch {
    return { deps: [] };
  }
}

// ─── Extract project dir from cmd ────────────────────────────────────────────

function extractProjectDirFromCmd(cmd: string): string {
  // Match absolute path after node/node.exe: e.g. node /home/user/app/node_modules/.bin/vite
  const match = cmd.match(/node(?:\.exe)?\s+(\/[^\s]+)/);
  if (!match) { return ''; }
  const scriptPath = match[1];
  // If inside node_modules, project root is the parent of node_modules
  const nmIdx = scriptPath.indexOf('/node_modules/');
  if (nmIdx !== -1) { return scriptPath.substring(0, nmIdx); }
  // Otherwise use the script's directory
  const lastSlash = scriptPath.lastIndexOf('/');
  return lastSlash > 0 ? scriptPath.substring(0, lastSlash) : '';
}

// ─── Node.js framework detector ───────────────────────────────────────────────

function detectNodeFramework(cmd: string, deps: string[]): string | undefined {
  const has = (d: string) => deps.includes(d);

  // cmd-based fast checks (cover common dev-server binaries)
  if (cmd.includes('react-scripts'))                              { return 'React'; }
  if (cmd.includes('ng serve') || cmd.includes('@angular/cli'))   { return 'Angular'; }
  if (cmd.includes('nest start') || cmd.includes('@nestjs'))      { return 'NestJS'; }
  if (cmd.includes('astro'))                                      { return 'Astro'; }
  if (cmd.includes('remix-serve') || cmd.includes('@remix-run'))  { return 'Remix'; }
  if (cmd.includes('nuxt'))                                       { return 'Nuxt'; }
  if (cmd.includes('next'))                                       { return 'Next.js'; }
  if (cmd.includes('vue-cli-service') || cmd.includes('@vue/cli')){ return 'Vue'; }
  if (cmd.includes('svelte-kit') || cmd.includes('@sveltejs'))    { return 'SvelteKit'; }
  if (cmd.includes('vite'))                                       { return 'Vite'; }
  if (cmd.includes('webpack'))                                    { return 'Webpack'; }

  // deps-based (most accurate — specific → generic)
  if (deps.length > 0) {
    if (has('next'))                                 { return 'Next.js'; }
    if (has('nuxt') || has('@nuxt/core'))            { return 'Nuxt'; }
    if (has('@angular/core'))                        { return 'Angular'; }
    if (has('@sveltejs/kit'))                        { return 'SvelteKit'; }
    if (has('svelte'))                               { return 'Svelte'; }
    if (has('@remix-run/node'))                      { return 'Remix'; }
    if (has('astro'))                                { return 'Astro'; }
    if (has('@nestjs/core'))                         { return 'NestJS'; }
    if (has('@nrwl/workspace') || has('@nrwl/cli'))  { return 'Nx'; }
    if (has('react-dom') || has('react'))            { return 'React'; }
    if (has('vue'))                                  { return 'Vue'; }
    if (has('elysia'))                               { return 'Elysia'; }
    if (has('hono'))                                 { return 'Hono'; }
    if (has('fastify'))                              { return 'Fastify'; }
    if (has('express'))                              { return 'Express'; }
    if (has('koa'))                                  { return 'Koa'; }
    if (has('@hapi/hapi') || has('hapi'))            { return 'Hapi'; }
    if (has('vite'))                                 { return 'Vite'; }
    if (has('webpack') || has('webpack-dev-server')) { return 'Webpack'; }
  }

  return undefined;
}

// ─── Remote environment detection ───────────────────────────────────────────

type RemoteEnv = 'local' | 'wsl' | 'devcontainer' | 'ssh' | 'codespace';

function detectRemoteEnv(): RemoteEnv {
  const remoteName = vscode.env.remoteName; // 'wsl', 'ssh-remote', 'dev-container', 'codespaces', undefined
  if (!remoteName) { return 'local'; }
  if (remoteName === 'wsl')            { return 'wsl'; }
  if (remoteName === 'dev-container' || remoteName === 'attached-container') { return 'devcontainer'; }
  if (remoteName === 'ssh-remote')     { return 'ssh'; }
  if (remoteName === 'codespaces')     { return 'codespace'; }
  debugLog('Unknown remoteName: %s', remoteName);
  return 'local';
}

const ENV_LABELS: Record<RemoteEnv, { icon: string; label: string }> = {
  local:        { icon: '💻', label: 'Local' },
  wsl:          { icon: '🐧', label: 'WSL' },
  devcontainer: { icon: '📦', label: 'Dev Container' },
  ssh:          { icon: '🔑', label: 'SSH Remote' },
  codespace:    { icon: '☁️', label: 'Codespace' },
};

// ─── Docker container detection ─────────────────────────────────────────────

interface DockerContainerInfo {
  name: string;
  image: string;
}

/** Cache of host-port → container info, refreshed each scan cycle. */
let dockerPortMap: Map<string, DockerContainerInfo> = new Map();

/** Returns true if the raw process name (possibly truncated by lsof) looks like Docker. */
function isDockerProcess(rawName: string): boolean {
  const n = rawName.toLowerCase();
  return n.includes('com.docke') || n.includes('docker-proxy') || n.includes('docker') || n.includes('com.docker');
}

/**
 * Queries `docker ps` to build a map of host-port → { name, image }.
 * Called once per scan cycle; results are cached in `dockerPortMap`.
 */
async function refreshDockerPortMap(): Promise<void> {
  dockerPortMap = new Map();
  try {
    // Format: ContainerName|ImageName|Ports
    // Ports example: "0.0.0.0:5432->5432/tcp, 0.0.0.0:5433->5433/tcp"
    // In WSL, try `docker` first, then `docker.exe` (Docker Desktop WSL integration)
    let output = '';
    const cmd = 'docker ps --format "{{.Names}}|{{.Image}}|{{.Ports}}"';
    try {
      output = await execWithTimeout(cmd, 3000);
    } catch {
      if (detectRemoteEnv() === 'wsl') {
        output = await execWithTimeout(cmd.replace('docker', 'docker.exe'), 3000);
      } else {
        throw new Error('docker not available');
      }
    }
    for (const line of output.split('\n')) {
      if (!line.trim()) { continue; }
      const [name, image, portsStr] = line.split('|');
      if (!name || !portsStr) { continue; }
      // Parse each port mapping: "0.0.0.0:5432->5432/tcp"
      const portMappings = portsStr.match(/(?:\d+\.\d+\.\d+\.\d+|::):(\d+)->/g) || [];
      for (const m of portMappings) {
        const hostPort = m.match(/:(\d+)->/)?.[1];
        if (hostPort) {
          dockerPortMap.set(hostPort, { name, image });
        }
      }
    }
    debugLog('Docker port map: %d entries', dockerPortMap.size);
  } catch (err) {
    debugLog('Docker detection unavailable: %o', err);
  }
}

/** Look up a Docker container by the host port it exposes. */
function getDockerContainerForPort(port: string): DockerContainerInfo | undefined {
  return dockerPortMap.get(port);
}

// ─── Service identification ───────────────────────────────────────────────────

const SERVICE_PATTERNS: Array<{ name: string; patterns: string[] }> = [
  { name: 'PostgreSQL',  patterns: ['postgres', 'postgresql', 'psql'] },
  { name: 'MySQL',       patterns: ['mysqld', 'mysql.server', 'mariadb'] },
  { name: 'MongoDB',     patterns: ['mongod', 'mongodb'] },
  { name: 'Redis',       patterns: ['redis-server'] },
  { name: 'Spring Boot', patterns: ['spring-boot', 'spring.boot', 'springboot'] },
  { name: 'Java',        patterns: ['java', 'javaw', '.jar', 'tomcat'] },
  { name: 'Laravel',     patterns: ['artisan'] },
  { name: 'Rails',       patterns: ['rails server', 'rails s', 'puma', 'unicorn'] },
  { name: 'Django',      patterns: ['django', 'manage.py'] },
  { name: 'FastAPI',     patterns: ['uvicorn', 'fastapi'] },
  { name: 'Flask',       patterns: ['flask'] },
  { name: 'Python',      patterns: ['python', 'gunicorn'] },
  { name: 'PHP',         patterns: ['php', 'symfony'] },
  { name: 'Nginx',       patterns: ['nginx'] },
  { name: 'Apache',      patterns: ['apache2', 'httpd'] },
  { name: 'Go',          patterns: ['go run', 'go build'] },
  { name: 'Ruby',        patterns: ['ruby', 'bundle exec'] },
];

async function identifyService(processName: string, pid: string, port: string, isWindows: boolean): Promise<ServiceInfo> {
  const cached = getCachedService(pid);
  if (cached) { return cached; }

  let result: ServiceInfo = { platform: processName };

  // Docker container detection: if the process belongs to Docker, resolve via container info
  if (isDockerProcess(processName)) {
    const container = getDockerContainerForPort(port);
    if (container) {
      // Use image name as platform (e.g. "postgres:16-alpine") and container name as framework
      const displayImage = container.image;
      // Try to match container image against known service patterns for a friendly name
      const imageLower = displayImage.toLowerCase();
      let friendlyName: string | undefined;
      for (const svc of SERVICE_PATTERNS) {
        if (svc.patterns.some(p => imageLower.includes(p))) {
          friendlyName = svc.name;
          break;
        }
      }
      // Show "🐳 image" — strip registry prefix and tag for a short label
      const shortImage = displayImage.replace(/^[^/]*\//, '').replace(/:.*$/, '');
      result = {
        platform: friendlyName ?? displayImage,
        framework: `🐳 ${shortImage}`,
      };
      setCachedService(pid + ':' + port, result);
      return result;
    }
    // Docker process but can't resolve container — show generic Docker label
    result = { platform: 'Docker' };
    setCachedService(pid, result);
    return result;
  }

  try {
    // rawCmd preserves original case — needed for filesystem path operations
    const rawCmd = await getRawCommand(pid, isWindows);
    const cmd = rawCmd.toLowerCase();           // lowercased for pattern matching only
    const nameLower = processName.toLowerCase();

    if (cmd.includes('node') || nameLower.includes('node')) {
      // 1st pass: cmd-only detection (zero I/O)
      let framework = detectNodeFramework(cmd, []);

      if (!framework) {
        try {
          // Use rawCmd (original case) for path extraction so cat/readFile works on macOS
          const cwd = extractProjectDirFromCmd(rawCmd) || await getWorkingDir(pid, isWindows);
          if (cwd) {
            const pkgInfo = await readPkgInfo(cwd);
            framework = detectNodeFramework(cmd, pkgInfo.deps);
            debugLog('PID %s cwd=%s deps=%d framework=%s', pid, cwd, pkgInfo.deps.length, framework);
          }
        } catch (err) {
          debugLog('readPkgInfo failed for PID %s: %o', pid, err);
        }
      }

      result = { framework, platform: 'Node.js' };
    } else {
      // Pass 1: match by process name only — prevents cmd args (e.g. jdbc:postgresql)
      // from misidentifying a Java/Spring Boot process as PostgreSQL.
      for (const svc of SERVICE_PATTERNS) {
        if (svc.patterns.some(p => nameLower.includes(p))) {
          result = { platform: svc.name };
          break;
        }
      }
      // Pass 2: if no match by name, fall back to full command line
      if (!result.framework && result.platform === processName) {
        for (const svc of SERVICE_PATTERNS) {
          if (svc.patterns.some(p => cmd.includes(p))) {
            result = { platform: svc.name };
            break;
          }
        }
      }
    }
  } catch (err) {
    debugLog('Error identifying service for PID %s: %o', pid, err);
  }

  // HTTP refinement: probe the port to confirm/correct framework detection.
  // High-confidence HTTP signals (framework-specific markers) always win.
  // Low-confidence signals (Vite, React/CRA) only apply when process detection
  // didn't already find a specific frontend framework.
  const HIGH_CONFIDENCE_HTTP = new Set(['Next.js', 'Nuxt', 'Remix', 'Astro', 'SvelteKit', 'Angular']);
  const GENERIC_BUILD_TOOLS  = new Set(['Vite', 'Webpack']);

  if (!NON_HTTP_PORTS.has(port)) {
    try {
      const httpFramework = await probeHttpFramework(port);
      if (httpFramework) {
        const processHasSpecificFramework =
          result.framework !== undefined && !GENERIC_BUILD_TOOLS.has(result.framework);
        const shouldOverride =
          HIGH_CONFIDENCE_HTTP.has(httpFramework) || !processHasSpecificFramework;

        if (shouldOverride) {
          debugLog('Port %s HTTP probe → %s (was: %s)', port, httpFramework, result.framework ?? result.platform);
          result = { ...result, framework: httpFramework };
        } else {
          debugLog('Port %s HTTP probe → %s ignored (process already found: %s)', port, httpFramework, result.framework);
        }
      }
    } catch (err) {
      debugLog('HTTP probe failed for port %s: %o', port, err);
    }
  }

  setCachedService(pid, result);
  return result;
}

// ─── System process filter ───────────────────────────────────────────────────

// Raw process names (from lsof/ss/powershell) that are IDE internals or OS
// services — not relevant to software development.
const SYSTEM_PROCESS_BLOCKLIST = [
  'code\\x20h', 'code helper', 'code - helper',  // VS Code Helper (macOS escapes space as \x20)
  'electron', 'crashpad',
  'webstorm', 'intellij', 'clion', 'goland', 'rider',
  'xpcproxy', 'launchd', 'com.apple', 'coreaudio',
  'controlce', 'airplay', 'rapportd', 'remoted',
];

function isSystemProcess(rawName: string): boolean {
  const n = rawName.toLowerCase();
  if (SYSTEM_PROCESS_BLOCKLIST.some(p => n.includes(p))) { return true; }
  // lsof escapes spaces as \x20 — "Code Helper" → "Code\x20H…" (any VS Code helper variant)
  if (/^code[^a-z0-9]/.test(n)) { return true; }
  return false;
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
    if (!portSet.has(port) && !isSystemProcess(procName)) {
      portSet.add(port);
      const serviceInfo = await identifyService(procName, pid, port, true);
      result.push({ port, pid, process: serviceInfo.platform, framework: serviceInfo.framework });
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
    if (isSystemProcess(parts[0])) { continue; }
    portSet.add(port);
    const pid = parts[1];
    const serviceInfo = await identifyService(parts[0], pid, port, isWindows);
    result.push({ port, pid, process: serviceInfo.platform, framework: serviceInfo.framework });
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

    if (isSystemProcess(procName)) { continue; }

    if (pid) {
      const serviceInfo = await identifyService(procName, pid, port, false);
      result.push({ port, pid, process: serviceInfo.platform, framework: serviceInfo.framework });
    } else {
      result.push({ port, pid: '', process: procName });
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
          results.push({ port: port.toString(), pid: '', process: info.platform, framework: info.framework });
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

  // Refresh Docker container→port mapping before collecting ports
  await refreshDockerPortMap();

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

// ─── Kill process ─────────────────────────────────────────────────────────────

async function killProcess(pid: string): Promise<void> {
  const isWin = platform() === 'win32';
  const cmd = isWin ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`;
  await execWithTimeout(cmd, 5000);
}

// ─── Webview shell ────────────────────────────────────────────────────────────

function getWebviewShell(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--vscode-sideBar-background);
      color: var(--vscode-sideBar-foreground, var(--vscode-foreground));
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      padding: 8px 10px;
      overflow-x: hidden;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      opacity: 0.7;
    }
    .env-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
      background: var(--vscode-badge-background, rgba(128,128,128,0.2));
      color: var(--vscode-badge-foreground, var(--vscode-foreground));
      white-space: nowrap;
      margin-left: auto;
      margin-right: 6px;
    }
    .env-badge:empty { display: none; }
    .refresh-btn {
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 3px;
      padding: 3px 8px;
      cursor: pointer;
      font-size: 11px;
      font-family: var(--vscode-font-family);
      display: flex;
      align-items: center;
      gap: 4px;
      transition: background 0.15s;
    }
    .refresh-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground));
    }
    .refresh-icon { display: inline-block; }
    .refresh-btn.loading .refresh-icon { animation: spin 0.7s linear infinite; }
    .search-wrap { margin-bottom: 6px; }
    .search-input {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 3px;
      padding: 4px 8px;
      font-size: 12px;
      font-family: var(--vscode-font-family);
      outline: none;
    }
    .search-input:focus { border-color: var(--vscode-focusBorder); }
    .search-input::placeholder {
      color: var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground));
    }
    .filter-tabs {
      display: flex;
      margin-bottom: 8px;
      border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-contrastBorder, rgba(128,128,128,0.2)));
    }
    .filter-tab {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-family: var(--vscode-font-family);
      padding: 3px 8px;
      margin-bottom: -1px;
      cursor: pointer;
      transition: color 0.15s;
    }
    .filter-tab:hover { color: var(--vscode-foreground); }
    .filter-tab.active {
      color: var(--vscode-foreground);
      border-bottom-color: var(--vscode-focusBorder);
    }
    #port-list { display: flex; flex-direction: column; gap: 4px; }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 6px;
      border-radius: 4px;
      transition: background 0.1s;
      gap: 4px;
    }
    .row:hover { background: var(--vscode-list-hoverBackground); }
    .row:hover .actions { visibility: visible; }
    .port-info { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }
    .port {
      background: #2ea043;
      color: #fff;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      min-width: 48px;
      text-align: center;
      flex-shrink: 0;
    }
    .row.is-favorite .port { background: #d4a017; }
    .service {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 150px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      outline: 1px solid var(--vscode-contrastBorder, transparent);
    }
    /* ── Service brand colors ── */
    .s-angular     { background: #dd0031 !important; color: #fff !important; }
    .s-react       { background: #20232a !important; color: #61dafb !important; }
    .s-next-js     { background: #000    !important; color: #fff !important; }
    .s-vue         { background: #42b883 !important; color: #fff !important; }
    .s-nuxt        { background: #00c16a !important; color: #fff !important; }
    .s-sveltekit   { background: #ff3e00 !important; color: #fff !important; }
    .s-svelte      { background: #ff3e00 !important; color: #fff !important; }
    .s-remix       { background: #1d1d1d !important; color: #fff !important; }
    .s-astro       { background: #ff5d01 !important; color: #fff !important; }
    .s-node-js     { background: #68a063 !important; color: #fff !important; }
    .s-nestjs      { background: #e0234e !important; color: #fff !important; }
    .s-nx          { background: #002f56 !important; color: #fff !important; }
    .s-express     { background: #303030 !important; color: #fff !important; }
    .s-fastify     { background: #202020 !important; color: #fff !important; }
    .s-koa         { background: #33333d !important; color: #fff !important; }
    .s-hapi        { background: #eb6100 !important; color: #fff !important; }
    .s-hono        { background: #e36002 !important; color: #fff !important; }
    .s-elysia      { background: #8b5cf6 !important; color: #fff !important; }
    .s-vite        { background: #646cff !important; color: #fff !important; }
    .s-webpack     { background: #8dd6f9 !important; color: #000 !important; }
    .s-postgresql  { background: #336791 !important; color: #fff !important; }
    .s-mysql       { background: #00758f !important; color: #fff !important; }
    .s-mongodb     { background: #4db33d !important; color: #fff !important; }
    .s-redis       { background: #d82c20 !important; color: #fff !important; }
    .s-spring-boot { background: #6db33f !important; color: #fff !important; }
    .s-java        { background: #007396 !important; color: #fff !important; }
    .s-laravel     { background: #ff2d20 !important; color: #fff !important; }
    .s-rails       { background: #cc0000 !important; color: #fff !important; }
    .s-django      { background: #0c3c26 !important; color: #44b78b !important; }
    .s-fastapi     { background: #009688 !important; color: #fff !important; }
    .s-flask       { background: #000    !important; color: #fff !important; }
    .s-python      { background: #3776ab !important; color: #fff !important; }
    .s-php         { background: #777bb3 !important; color: #fff !important; }
    .s-go          { background: #00add8 !important; color: #fff !important; }
    .s-nginx       { background: #009900 !important; color: #fff !important; }
    .s-apache      { background: #d22128 !important; color: #fff !important; }
    .s-ruby        { background: #cc342d !important; color: #fff !important; }
    /* ── Actions ── */
    .actions {
      display: flex;
      align-items: center;
      gap: 1px;
      flex-shrink: 0;
      visibility: hidden;
    }
    .action-btn {
      background: none;
      border: none;
      color: var(--vscode-icon-foreground, var(--vscode-foreground));
      cursor: pointer;
      padding: 3px 4px;
      border-radius: 3px;
      font-size: 12px;
      line-height: 1;
      opacity: 0.75;
      transition: background 0.1s, opacity 0.1s;
    }
    .action-btn:hover {
      background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2));
      opacity: 1;
    }
    .fav-btn {
      visibility: visible;
      opacity: 0.3;
      font-size: 14px;
      padding: 2px 3px;
      flex-shrink: 0;
    }
    .fav-btn.active { opacity: 1; color: #d4a017; }
    .row:hover .fav-btn { opacity: 0.6; }
    .row:hover .fav-btn.active { opacity: 1; }
    .kill-btn:hover { color: var(--vscode-errorForeground, #f55); opacity: 1; }
    .state-box {
      text-align: center;
      padding: 28px 16px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      display: none;
    }
    .state-box.visible { display: block; }
    .state-box .state-detail { margin-top: 6px; opacity: 0.7; font-size: 11px; word-break: break-word; }
    .retry-btn {
      margin-top: 10px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      padding: 4px 14px;
      font-size: 12px;
      font-family: var(--vscode-font-family);
      cursor: pointer;
    }
    .retry-btn:hover { background: var(--vscode-button-hoverBackground); }
    #loading-overlay {
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      background: var(--vscode-sideBar-background);
      opacity: 0.88;
    }
    #loading-overlay.visible { display: flex; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid var(--vscode-focusBorder, #007fd4);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="title">Active Ports</span>
    <span class="env-badge" id="env-badge"></span>
    <button class="refresh-btn" id="refresh-btn">
      <span class="refresh-icon">&#x21BB;</span> Synchronize
    </button>
  </div>

  <div class="search-wrap">
    <input class="search-input" id="search-input" type="text" placeholder="Filter by port or service&#x2026;">
  </div>

  <div class="filter-tabs">
    <button class="filter-tab active" data-cat="all">All</button>
    <button class="filter-tab" data-cat="node">Node</button>
    <button class="filter-tab" data-cat="db">DB</button>
    <button class="filter-tab" data-cat="web">Web</button>
    <button class="filter-tab" data-cat="docker">Docker</button>
    <button class="filter-tab" data-cat="other">Other</button>
  </div>

  <div id="port-list"></div>

  <div class="state-box" id="empty-state">
    <div>No active ports detected</div>
    <button class="retry-btn" id="empty-retry">Refresh</button>
  </div>

  <div class="state-box" id="error-state">
    <div>Failed to detect ports</div>
    <p class="state-detail" id="error-detail"></p>
    <button class="retry-btn" id="error-retry">Try again</button>
  </div>

  <div id="loading-overlay" class="visible">
    <div class="spinner"></div>
  </div>

  <script nonce="${nonce}">
    var vscode = acquireVsCodeApi();
    var allPorts = [];
    // Signal extension that webview JS is ready — triggers initial port load
    vscode.postMessage({ command: 'ready' });
    var favorites = [];
    var activeFilter = 'all';
    var searchQuery = '';
    var hasLoaded = false;

    var DB_NAMES   = ['postgresql','mysql','mongodb','redis','mariadb','cassandra','sqlite'];
    var NODE_NAMES = ['node.js','angular','react','next.js','vue','nuxt','sveltekit','svelte',
                      'remix','astro','nestjs','nx','express','fastify','koa','hapi','hono',
                      'elysia','vite','webpack'];
    var WEB_NAMES  = ['python','php','java','spring boot','nginx','apache','django',
                      'fastapi','flask','laravel','rails','go','ruby'];

    function getCategory(label) {
      var p = (label || '').toLowerCase();
      if (p.indexOf('🐳') !== -1 || p.indexOf('docker') !== -1) { return 'docker'; }
      if (DB_NAMES.some(function(n)  { return p.indexOf(n) !== -1; })) { return 'db'; }
      if (NODE_NAMES.some(function(n){ return p.indexOf(n) !== -1; })) { return 'node'; }
      if (WEB_NAMES.some(function(n) { return p.indexOf(n) !== -1; })) { return 'web'; }
      return 'other';
    }

    function getServiceClass(name) {
      return 's-' + (name || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
    }

    function buildRowHtml(p) {
      var isFav    = favorites.indexOf(p.port) !== -1;
      var label    = p.framework || p.process;
      var svcClass = getServiceClass(label);
      var pid      = p.pid || '';
      var killHtml = pid
        ? '<button class="action-btn kill-btn" title="Stop process" data-action="kill">&#x2715;</button>'
        : '';
      return '<div class="row' + (isFav ? ' is-favorite' : '') + '"' +
               ' data-port="' + p.port + '"' +
               ' data-pid="' + pid + '"' +
               ' data-label="' + label.toLowerCase() + '">' +
               '<button class="action-btn fav-btn' + (isFav ? ' active' : '') + '"' +
                 ' title="' + (isFav ? 'Remove favorite' : 'Add to favorites') + '"' +
                 ' data-action="fav">&#x2605;</button>' +
               '<div class="port-info">' +
                 '<div class="port">' + p.port + '</div>' +
                 '<div class="service ' + svcClass + '">' + label + '</div>' +
               '</div>' +
               '<div class="actions">' +
                 '<button class="action-btn" title="Copy port" data-action="copyPort">&#x2398;</button>' +
                 '<button class="action-btn" title="Copy URL" data-action="copyUrl">&#x1F517;</button>' +
                 '<button class="action-btn" title="Open in browser" data-action="open">&#x2197;</button>' +
                 killHtml +
               '</div>' +
             '</div>';
    }

    function applyFilter() {
      var q = searchQuery.toLowerCase();
      var rows = document.querySelectorAll('#port-list .row');
      var visibleCount = 0;
      rows.forEach(function(row) {
        var text = (row.dataset.port || '') + ' ' + (row.dataset.label || '');
        var matchSearch = !q || text.indexOf(q) !== -1;
        var matchCat = activeFilter === 'all' || getCategory(row.dataset.label) === activeFilter;
        var show = matchSearch && matchCat;
        row.style.display = show ? '' : 'none';
        if (show) { visibleCount++; }
      });
      var errVisible = document.getElementById('error-state').classList.contains('visible');
      document.getElementById('empty-state').classList.toggle('visible',
        hasLoaded && visibleCount === 0 && !errVisible);
    }

    function renderPorts() {
      var list = document.getElementById('port-list');
      var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      var sorted = allPorts.slice().sort(function(a, b) {
        var aFav = favorites.indexOf(a.port) !== -1 ? 0 : 1;
        var bFav = favorites.indexOf(b.port) !== -1 ? 0 : 1;
        if (aFav !== bFav) { return aFav - bFav; }
        return parseInt(a.port) - parseInt(b.port);
      });
      list.innerHTML = sorted.map(buildRowHtml).join('');
      document.documentElement.scrollTop = scrollTop;
      document.body.scrollTop = scrollTop;
      applyFilter();
    }

    document.getElementById('port-list').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      var row = e.target.closest('.row');
      if (!btn || !row) { return; }
      var port   = row.dataset.port;
      var pid    = row.dataset.pid;
      var action = btn.dataset.action;
      if (action === 'open')     { vscode.postMessage({ command: 'open',           port: port }); }
      if (action === 'copyUrl')  { vscode.postMessage({ command: 'copyUrl',        port: port }); }
      if (action === 'copyPort') { vscode.postMessage({ command: 'copyPort',       port: port }); }
      if (action === 'kill')     { vscode.postMessage({ command: 'killPort',       port: port, pid: pid }); }
      if (action === 'fav')      { vscode.postMessage({ command: 'toggleFavorite', port: port }); }
    });

    window.addEventListener('message', function(e) {
      var msg = e.data;
      if (msg.command === 'updatePorts') {
        hasLoaded = true;
        document.getElementById('loading-overlay').classList.remove('visible');
        document.getElementById('refresh-btn').classList.remove('loading');
        if (msg.error) {
          document.getElementById('error-detail').textContent = msg.error;
          document.getElementById('error-state').classList.add('visible');
          document.getElementById('empty-state').classList.remove('visible');
          document.getElementById('port-list').innerHTML = '';
        } else {
          document.getElementById('error-state').classList.remove('visible');
          allPorts  = msg.ports     || [];
          favorites = msg.favorites || [];
          var badge = document.getElementById('env-badge');
          if (msg.env) {
            badge.textContent = msg.env.icon + ' ' + msg.env.label;
          } else {
            badge.textContent = '';
          }
          renderPorts();
        }
      } else if (msg.command === 'setLoading') {
        document.getElementById('loading-overlay').classList.toggle('visible', !!msg.loading);
        document.getElementById('refresh-btn').classList.toggle('loading', !!msg.loading);
      } else if (msg.command === 'copyFeedback') {
        var row = document.querySelector('.row[data-port="' + msg.port + '"]');
        if (!row) { return; }
        row.querySelectorAll('[data-action="copyPort"], [data-action="copyUrl"]').forEach(function(btn) {
          var orig = btn.innerHTML;
          btn.innerHTML = '&#x2713;';
          setTimeout(function() { btn.innerHTML = orig; }, 1500);
        });
      }
    });

    document.getElementById('search-input').addEventListener('input', function(e) {
      searchQuery = e.target.value;
      applyFilter();
    });

    document.querySelectorAll('.filter-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        activeFilter = tab.dataset.cat;
        document.querySelectorAll('.filter-tab').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        applyFilter();
      });
    });

    document.getElementById('refresh-btn').addEventListener('click', function() {
      vscode.postMessage({ command: 'refresh' });
    });
    document.getElementById('empty-retry').addEventListener('click', function() {
      vscode.postMessage({ command: 'refresh' });
    });
    document.getElementById('error-retry').addEventListener('click', function() {
      document.getElementById('error-state').classList.remove('visible');
      vscode.postMessage({ command: 'refresh' });
    });
  </script>
</body>
</html>`;
}

// ─── Extension ────────────────────────────────────────────────────────────────

class LocalhostPortsWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _isRefreshing = false;
  private _lastPorts: PortInfo[] = [];

  constructor(private readonly _context: vscode.ExtensionContext) {}

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getWebviewShell(generateNonce());

    webviewView.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
  }

  private getFavorites(): string[] {
    return this._context.globalState.get<string[]>('favorites', []);
  }

  private async setFavorites(ports: string[]): Promise<void> {
    await this._context.globalState.update('favorites', ports);
  }

  private async handleMessage(msg: { command: string; [k: string]: string }) {
    switch (msg.command) {
      case 'open': {
        if (!isValidPort(msg.port)) { return; }
        const url = `http://localhost:${msg.port}`;
        const target = getConfig().get<string>('openBrowserTarget', 'external');
        if (target === 'internal') {
          try {
            await vscode.commands.executeCommand('simpleBrowser.show', url);
          } catch {
            await vscode.env.openExternal(vscode.Uri.parse(url));
          }
        } else {
          await vscode.env.openExternal(vscode.Uri.parse(url));
        }
        break;
      }

      case 'copyUrl':
        if (!isValidPort(msg.port)) { return; }
        await vscode.env.clipboard.writeText(`http://localhost:${msg.port}`);
        this._view?.webview.postMessage({ command: 'copyFeedback', port: msg.port });
        break;

      case 'copyPort':
        if (!isValidPort(msg.port)) { return; }
        await vscode.env.clipboard.writeText(msg.port);
        this._view?.webview.postMessage({ command: 'copyFeedback', port: msg.port });
        break;

      case 'killPort': {
        if (!msg.pid) { return; }
        const answer = await vscode.window.showWarningMessage(
          `Kill process on port ${msg.port}?`,
          { modal: true },
          'Terminate'
        );
        if (answer !== 'Terminate') { return; }
        try {
          await killProcess(msg.pid);
          await this.refreshPorts();
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to kill process: ${String(err)}`);
        }
        break;
      }

      case 'toggleFavorite': {
        const favs = this.getFavorites();
        const newFavs = favs.includes(msg.port)
          ? favs.filter(p => p !== msg.port)
          : [...favs, msg.port];
        await this.setFavorites(newFavs);
        this._view?.webview.postMessage({
          command: 'updatePorts',
          ports: this._lastPorts,
          favorites: newFavs,
          error: null,
        });
        break;
      }

      case 'ready':
      case 'refresh':
        await this.refreshPorts();
        break;
    }
  }

  private async refreshPorts() {
    if (this._isRefreshing || !this._view) { return; }
    this._isRefreshing = true;
    this._view.webview.postMessage({ command: 'setLoading', loading: true });
    try {
      const ports = await getListeningPorts();
      this._lastPorts = ports;
      if (this._view) {
        const env = detectRemoteEnv();
        const envInfo = env !== 'local' ? ENV_LABELS[env] : null;
        this._view.webview.postMessage({
          command: 'updatePorts',
          ports,
          favorites: this.getFavorites(),
          error: null,
          env: envInfo,
        });
      }
    } catch (err) {
      debugLog('refreshPorts error: %o', err);
      if (this._view) {
        this._view.webview.postMessage({
          command: 'updatePorts',
          ports: [],
          favorites: this.getFavorites(),
          error: String(err),
        });
      }
    } finally {
      this._isRefreshing = false;
    }
  }
}

// ─── What's New ───────────────────────────────────────────────────────────────

const WHATS_NEW: Record<string, string[]> = {
  '0.0.20': [
    'Open source release — MIT license, CONTRIBUTING guide, CODE_OF_CONDUCT',
    'Issue templates by OS (macOS, Linux, Windows) on GitHub',
    'Improved Marketplace page: keywords, badges, full README rewrite',
  ],
  '0.0.19': [
    'Framework detection via package.json (React, Next.js, Nuxt, Svelte, Astro, Remix…)',
    'Copy port / Copy URL actions per row',
    'Kill process with confirmation dialog',
    'Search bar + quick filter tabs (Node / DB / Web / Other)',
    'Favorites — pin ports to the top, persists across restarts',
    'Loading, empty and error states',
    'Native VS Code theme support (dark, light, high contrast)',
    'Scroll position preserved between auto-refreshes',
  ],
};

async function showWhatsNew(context: vscode.ExtensionContext): Promise<void> {
  const current  = context.extension.packageJSON.version as string;
  const previous = context.globalState.get<string>('version');

  await context.globalState.update('version', current);

  if (!previous || previous === current) { return; }

  const notes = WHATS_NEW[current];
  const summary = notes
    ? notes.map(n => `• ${n}`).join('\n')
    : `See the full changelog on GitHub.`;

  const choice = await vscode.window.showInformationMessage(
    `Localhost Ports Viewer updated to v${current}`,
    { detail: summary, modal: false },
    'See changelog',
    'Dismiss'
  );

  if (choice === 'See changelog') {
    vscode.env.openExternal(
      vscode.Uri.parse('https://github.com/daniloagostinho/localhost-ports-viewer/blob/main/changelog.md')
    );
  }
}

export function activate(context: vscode.ExtensionContext) {
  showWhatsNew(context);

  const provider = new LocalhostPortsWebviewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('localhostPorts', provider)
  );
}

export function deactivate() {}
