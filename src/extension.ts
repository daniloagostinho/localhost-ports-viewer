// Extensão VS Code com WebviewViewProvider no painel lateral (visual premium)

import { exec } from 'child_process';
import { platform } from 'os';
import tcpPortUsed from 'tcp-port-used';
import { promisify } from 'util';
import * as vscode from 'vscode';
const execAsync = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
  const provider = new LocalhostPortsWebviewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('localhostPorts', provider)
  );
}

class LocalhostPortsWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _refreshInterval?: NodeJS.Timeout;

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    
    webviewView.webview.options = {
      enableScripts: true
    };

    // Iniciar refresh automático
    this.startAutoRefresh();

    // Atualizar conteúdo inicial
    await this.updateContent();

    webviewView.onDidDispose(() => {
      this.stopAutoRefresh();
    });

    webviewView.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'open':
          vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${msg.port}`));
          break;
        case 'refresh':
          this.updateContent();
          break;
      }
    });
  }

  private startAutoRefresh() {
    this.stopAutoRefresh();
    this._refreshInterval = setInterval(() => {
      this.updateContent();
    }, 5000);
  }

  private stopAutoRefresh() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = undefined;
    }
  }

  private async updateContent() {
    if (this._view) {
      const ports = await getListeningPorts();
      this._view.webview.html = getWebviewContent(ports);
    }
  }
}

function generatePortRange(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

interface ServiceInfo {
  framework?: string;
  platform: string;
}

async function getProcessCommand(pid: string, isWindows: boolean): Promise<string> {
  try {
    if (isWindows) {
      // No Windows, tenta wmic primeiro para pegar a linha de comando completa
      try {
        const { stdout } = await execAsync(`wmic process where ProcessId=${pid} get CommandLine /format:list`);
        if (stdout.trim()) {
          return stdout.toLowerCase();
        }
      } catch {}

      // Se falhar, tenta tasklist com mais detalhes
      try {
        const { stdout } = await execAsync(`tasklist /v /fi "PID eq ${pid}"`);
        return stdout.toLowerCase();
      } catch {}
    } else {
      // No Unix, tenta diferentes métodos
      try {
        // Tenta ps com formato detalhado primeiro
        const { stdout } = await execAsync(`ps -p ${pid} -o command= -o args= -o comm=`);
        return stdout.toLowerCase();
      } catch {
        try {
          // Depois tenta ps aux
          const { stdout } = await execAsync(`ps aux | grep ${pid} | grep -v grep`);
          return stdout.toLowerCase();
        } catch {
          try {
            // Por último tenta procfs no Linux
            const { stdout: cmdline } = await execAsync(`cat /proc/${pid}/cmdline`);
            const { stdout: environ } = await execAsync(`cat /proc/${pid}/environ`);
            return `${cmdline} ${environ}`.toLowerCase();
          } catch {}
        }
      }
    }
  } catch (error) {
    console.error('Error getting process command:', error);
  }
  return '';
}

async function getNodeModules(pid: string, isWindows: boolean): Promise<string[]> {
  try {
    if (isWindows) {
      const { stdout } = await execAsync(`wmic process where ProcessId=${pid} get ExecutablePath /format:list`);
      const path = stdout.trim().split('=')[1];
      if (path) {
        const workingDir = path.substring(0, path.lastIndexOf('\\'));
        try {
          const { stdout: modules } = await execAsync(`dir "${workingDir}\\node_modules" /b`);
          return modules.split('\n').map(m => m.trim().toLowerCase());
        } catch {}
      }
    } else {
      const { stdout: pwdOutput } = await execAsync(`lsof -p ${pid} | grep cwd`);
      const workingDir = pwdOutput.split(/\s+/)[8];
      if (workingDir) {
        try {
          const { stdout: modules } = await execAsync(`ls ${workingDir}/node_modules`);
          return modules.split('\n').map(m => m.trim().toLowerCase());
        } catch {}
      }
    }
  } catch (error) {
    console.error('Error getting node_modules:', error);
  }
  return [];
}

async function identifyService(processName: string, pid: string, isWindows: boolean): Promise<ServiceInfo> {
  try {
    // Pega o comando completo do processo
    const cmd = await getProcessCommand(pid, isWindows);
    
    // Se for um processo node, tenta identificar o framework
    if (cmd.includes('node') || processName.toLowerCase().includes('node')) {
      // Pega a lista de módulos node instalados
      const nodeModules = await getNodeModules(pid, isWindows);
      
      // Identificadores específicos nos comandos e módulos
      const frameworkPatterns = {
        Angular: {
          cmd: ['ng serve', '@angular/cli', '@angular-devkit', 'angular.json'],
          modules: ['@angular/core', '@angular/cli', '@angular-devkit']
        },
        React: {
          cmd: ['react-scripts', 'create-react-app', 'next dev', 'vite'],
          modules: ['react', 'react-dom', 'react-scripts', 'next', '@vitejs']
        },
        Vue: {
          cmd: ['vue-cli-service', '@vue/cli', 'nuxt'],
          modules: ['vue', '@vue/cli-service', 'nuxt']
        },
        Nx: {
          cmd: ['nx serve', '@nrwl/cli'],
          modules: ['@nrwl/workspace', '@nrwl/cli']
        },
        Express: {
          cmd: ['express', 'node server'],
          modules: ['express']
        },
        NestJS: {
          cmd: ['nest start', '@nestjs'],
          modules: ['@nestjs/core']
        }
      };

      // Verifica cada framework
      for (const [framework, patterns] of Object.entries(frameworkPatterns)) {
        // Verifica padrões no comando
        const hasCmdPattern = patterns.cmd.some(pattern => cmd.includes(pattern));
        // Verifica módulos instalados
        const hasModules = patterns.modules.some(module => nodeModules.includes(module));

        if (hasCmdPattern || hasModules) {
          return {
            framework,
            platform: 'Node.js'
          };
        }
      }

      // Se não identificou nenhum framework específico
      return {
        platform: 'Node.js'
      };
    }

    // Identificadores para outros serviços
    const servicePatterns = [
      {
        name: 'PostgreSQL',
        patterns: ['postgres', 'postgresql', 'psql']
      },
      {
        name: 'MySQL',
        patterns: ['mysqld', 'mysql.server', 'mariadb']
      },
      {
        name: 'MongoDB',
        patterns: ['mongod', 'mongodb']
      },
      {
        name: 'Redis',
        patterns: ['redis-server']
      },
      {
        name: 'Java',
        patterns: ['java', 'javaw', '.jar', 'spring-boot', 'tomcat']
      },
      {
        name: 'Python',
        patterns: ['python', 'flask', 'django', 'uvicorn', 'gunicorn']
      },
      {
        name: 'PHP',
        patterns: ['php', 'apache2', 'nginx', 'artisan', 'symfony']
      }
    ];

    // Verifica outros serviços
    for (const service of servicePatterns) {
      if (service.patterns.some(pattern => 
        cmd.includes(pattern) || 
        processName.toLowerCase().includes(pattern)
      )) {
        return {
          platform: service.name
        };
      }
    }

    // Se não identificou nada, retorna o nome do processo
    return {
      platform: processName
    };
  } catch (error) {
    console.error('Error identifying service:', error);
    return {
      platform: processName
    };
  }
}

async function getListeningPorts(): Promise<PortInfo[]> {
  const result: PortInfo[] = [];
  const isWindows = platform() === 'win32';
  
  try {
    if (isWindows) {
      // Windows: usa netstat com mais detalhes
      const { stdout: netstatOutput } = await execAsync('netstat -ano -p TCP | findstr LISTENING');
      const { stdout: tasklistOutput } = await execAsync('tasklist /v /fo csv');
      
      // Cria um mapa de PIDs para nomes de processo do tasklist
      const pidToName = new Map<string, string>();
      tasklistOutput.split('\n').forEach(line => {
        if (line) {
          const parts = line.split(',').map(part => part.replace(/"/g, ''));
          if (parts.length >= 2) {
            const [name, pid] = parts;
            pidToName.set(pid, name);
          }
        }
      });

      // Processa as portas e processos
      const lines = netstatOutput.split('\n');
      const portSet = new Set<string>();

      for (const line of lines) {
        if (line.trim()) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5) {
            const addressPart = parts[1];
            const pid = parts[4];
            
            const portMatch = addressPart.match(/:(\d+)$/);
            if (portMatch) {
              const port = portMatch[1];
              if (!portSet.has(port)) {
                portSet.add(port);
                
                const processName = pidToName.get(pid) || 'PORT IN USE';
                const serviceInfo = await identifyService(processName, pid, isWindows);
                
                // Adiciona informações do framework e plataforma
                result.push({ 
                  port: port,
                  process: serviceInfo.platform,
                  framework: serviceInfo.framework
                });
              }
            }
          }
        }
      }
    } else {
      // Unix: Combina lsof com mais informações de processo
      const { stdout: lsofOutput } = await execAsync('lsof -i TCP -P -n | grep LISTEN');

      const lines = lsofOutput.split('\n');
      const portSet = new Set<string>();

      for (const line of lines) {
        if (line.trim()) {
          const portMatch = line.match(/[.:](\d+)\s+\(LISTEN\)/);
          const parts = line.split(/\s+/);
          
          if (portMatch && parts.length >= 2) {
            const port = portMatch[1];
            const processName = parts[0];
            const pid = parts[1];
            
            if (!portSet.has(port)) {
              portSet.add(port);
              
              // Identifica o serviço com framework e plataforma
              const serviceInfo = await identifyService(processName, pid, isWindows);
              
              result.push({ 
                port: port,
                process: serviceInfo.platform,
                framework: serviceInfo.framework
              });
            }
          }
        }
      }
    }

    if (result.length === 0) {
      throw new Error('No ports found, using fallback');
    }

  } catch (error) {
    console.error('Error getting active ports:', error);
    
    // Fallback com verificação mais rápida
    const portRanges = generatePortRanges(1024, 65535, 100);
    const commonPorts = new Set([3000, 3001, 4200, 5000, 8000, 8080]);

    // Primeiro verifica as portas comuns
    for (const port of commonPorts) {
      try {
        const [v4, v6] = await Promise.all([
          tcpPortUsed.check(port, '127.0.0.1'),
          tcpPortUsed.check(port, '::1')
        ]);
        
        if (v4 || v6) {
          // No fallback, tenta identificar pelo menos alguns serviços comuns pela porta
          let serviceInfo: ServiceInfo = { platform: 'PORT IN USE' };
          
          // Tenta identificar alguns serviços comuns por porta
          if (port === 4200) {
            serviceInfo = { framework: 'Angular', platform: 'Node.js' };
          } else if (port === 3000) {
            serviceInfo = { framework: 'React', platform: 'Node.js' };
          } else if (port === 8080) {
            serviceInfo = { platform: 'Java' };
          } else if (port === 5432) {
            serviceInfo = { platform: 'PostgreSQL' };
          } else if (port === 3306) {
            serviceInfo = { platform: 'MySQL' };
          } else if (port === 27017) {
            serviceInfo = { platform: 'MongoDB' };
          }
          
          result.push({ 
            port: port.toString(),
            process: serviceInfo.platform,
            framework: serviceInfo.framework
          });
        }
      } catch (err) {
        // Ignora erros de verificação individual de porta
      }
    }

    // Depois verifica os outros ranges
    for (const range of portRanges) {
      for (let port = range.start; port <= range.end; port++) {
        if (!commonPorts.has(port)) {
          try {
            const [v4, v6] = await Promise.all([
              tcpPortUsed.check(port, '127.0.0.1'),
              tcpPortUsed.check(port, '::1')
            ]);
            
            if (v4 || v6) {
              result.push({ 
                port: port.toString(),
                process: 'PORT IN USE'
              });
            }
          } catch (err) {
            // Ignora erros de verificação individual de porta
          }
        }
      }
    }
  }

  return result.sort((a, b) => parseInt(a.port) - parseInt(b.port));
}

function generatePortRanges(start: number, end: number, step: number): Array<{start: number, end: number}> {
  const ranges = [];
  for (let i = start; i < end; i += step) {
    ranges.push({
      start: i,
      end: Math.min(i + step - 1, end)
    });
  }
  return ranges;
}

function getWebviewContent(ports: PortInfo[]): string {
  const rows = ports.map(p => {
    const serviceClass = p.process.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const serviceDisplay = p.framework ? `${p.framework} (${p.process})` : p.process;
    
    return `
    <div class="row">
      <div class="port-info">
        <div class="port">${p.port}</div>
        <div class="service ${serviceClass}">${serviceDisplay}</div>
      </div>
      <button class="open-btn" onclick="openPort('${p.port}')">
        <span class="arrow">→</span>
        <span class="tooltip">Open in browser</span>
      </button>
    </div>
  `}).join('\n');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
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
        .refresh-btn:hover {
          background-color: #3d3d3d;
          color: white;
        }
        .refresh-icon {
          font-size: 14px;
        }
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
        .row:hover {
          background: #2d2d2d;
        }
        .port-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }
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
        .angular {
          background-color: #dd0031;
          color: white;
        }
        .react {
          background-color: #61dafb;
          color: black;
        }
        .vue {
          background-color: #42b883;
          color: white;
        }
        .node-js {
          background-color: #68a063;
          color: white;
        }
        .postgresql {
          background-color: #336791;
          color: white;
        }
        .mysql {
          background-color: #00758f;
          color: white;
        }
        .mongodb {
          background-color: #4db33d;
          color: white;
        }
        .redis {
          background-color: #d82c20;
          color: white;
        }
        .java {
          background-color: #007396;
          color: white;
        }
        .python {
          background-color: #3776ab;
          color: white;
        }
        .php {
          background-color: #777bb3;
          color: white;
        }
        .port-in-use {
          background-color: #6e7681;
          color: white;
        }
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
        .open-btn:hover {
          background-color: #3d3d3d;
          color: white;
        }
        .open-btn .arrow {
          transition: transform 0.2s ease;
        }
        .open-btn:hover .arrow {
          transform: translateX(2px);
        }
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
        .open-btn:hover .tooltip {
          opacity: 1;
          visibility: visible;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h3>ACTIVE PORTS</h3>
        <button class="refresh-btn" onclick="refreshPorts()">
          <span class="refresh-icon">↻</span>
          Synchronize
        </button>
      </div>
      ${rows}
      <script>
        const vscode = acquireVsCodeApi();
        
        function openPort(port) {
          vscode.postMessage({ command: 'open', port });
        }

        function refreshPorts() {
          vscode.postMessage({ command: 'refresh' });
        }
      </script>
    </body>
    </html>
  `;
}

interface PortInfo {
  port: string;
  process: string;
  framework?: string;
}

export function deactivate() {
  // Cleanup
}
