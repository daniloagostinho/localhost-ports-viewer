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

interface ProcessInfo {
  name: string;
  pid: string;
  cmd?: string;
}

async function identifyService(processName: string, pid: string, isWindows: boolean): Promise<string> {
  try {
    let cmd = '';
    if (isWindows) {
      const { stdout } = await execAsync(`wmic process where ProcessId=${pid} get CommandLine`);
      cmd = stdout.toLowerCase();
    } else {
      // No Unix, tenta pegar a linha de comando completa
      try {
        const { stdout } = await execAsync(`ps -p ${pid} -o command=`);
        cmd = stdout.toLowerCase();
      } catch {
        // Em alguns sistemas, pode precisar de sudo, então tenta ps aux como fallback
        const { stdout } = await execAsync(`ps aux | grep ${pid}`);
        cmd = stdout.toLowerCase();
      }
    }

    // Identificadores de diferentes frameworks/serviços
    const serviceIdentifiers = [
      { name: 'Angular', patterns: ['ng serve', '@angular/cli'] },
      { name: 'React', patterns: ['react-scripts start', 'next dev', 'vite --port'] },
      { name: 'Vue', patterns: ['vue-cli-service serve', '@vue/cli'] },
      { name: 'Nx', patterns: ['nx serve', '@nrwl/cli'] },
      { name: 'Spring Boot', patterns: ['spring-boot', 'tomcat'] },
      { name: 'Node.js', patterns: ['node server', 'nodemon', 'express'] },
      { name: 'Python', patterns: ['flask run', 'django', 'uvicorn', 'python manage.py runserver'] },
      { name: '.NET', patterns: ['dotnet run', 'dotnet watch run', 'aspnetcore'] },
      { name: 'PHP', patterns: ['php -S', 'artisan serve', 'symfony server:start'] }
    ];

    for (const service of serviceIdentifiers) {
      if (service.patterns.some(pattern => cmd.includes(pattern))) {
        return service.name;
      }
    }

    // Se o processo é node mas não identificamos o framework específico
    if (processName.toLowerCase().includes('node')) {
      return 'Node.js';
    }

    return processName;
  } catch (error) {
    return processName;
  }
}

async function getListeningPorts(): Promise<PortInfo[]> {
  const result: PortInfo[] = [];
  const isWindows = platform() === 'win32';
  
  try {
    let processOutput = '';
    let portOutput = '';

    if (isWindows) {
      // Windows: usa netstat e tasklist
      const { stdout: netstatOutput } = await execAsync('netstat -ano | findstr LISTENING');
      const { stdout: tasklistOutput } = await execAsync('tasklist /FO CSV');
      
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

      portOutput = netstatOutput;
      processOutput = tasklistOutput;

      // Processa netstat output
      const lines = netstatOutput.split('\n');
      const portSet = new Set<string>();

      for (const line of lines) {
        if (line.trim()) {
          // Formato do netstat: Proto  Local Address  Foreign Address  State  PID
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5) {
            const addressPart = parts[1];
            const pid = parts[4];
            
            // Extrai a porta do endereço local (formato pode ser *:porta ou [::]:porta ou IP:porta)
            const portMatch = addressPart.match(/:(\d+)$/);
            if (portMatch) {
              const port = portMatch[1];
              if (!portSet.has(port)) {
                portSet.add(port);
                
                // Pega o nome do processo do PID
                const processName = pidToName.get(pid) || 'PORT IN USE';
                
                // Identifica o serviço
                const serviceName = await identifyService(processName, pid, isWindows);
                
                result.push({ 
                  port: port,
                  process: serviceName
                });
              }
            }
          }
        }
      }
    } else {
      // Unix (macOS/Linux): usa lsof
      const { stdout: lsofOutput } = await execAsync('lsof -i TCP -P -n | grep LISTEN');
      portOutput = lsofOutput;

      // Processa a saída do lsof
      const lines = lsofOutput.split('\n');
      const portSet = new Set<string>();

      for (const line of lines) {
        if (line.trim()) {
          // Extrai a porta e o processo
          const portMatch = line.match(/[.:](\d+)\s+\(LISTEN\)/);
          const parts = line.split(/\s+/);
          
          if (portMatch && parts.length >= 2) {
            const port = portMatch[1];
            const processName = parts[0];
            const pid = parts[1];
            
            if (!portSet.has(port)) {
              portSet.add(port);
              
              // Identifica o serviço
              const serviceName = await identifyService(processName, pid, isWindows);
              
              result.push({ 
                port: port,
                process: serviceName
              });
            }
          }
        }
      }
    }

    // Se não encontrou nenhuma porta, usa o fallback
    if (result.length === 0) {
      throw new Error('No ports found, using fallback');
    }

  } catch (error) {
    console.error('Error getting active ports:', error);
    
    // Fallback: Tenta detectar portas em uso sem identificar o serviço
    const portRanges = generatePortRanges(1024, 65535, 100); // Gera ranges de 100 em 100 portas

    for (const range of portRanges) {
      for (let port = range.start; port <= range.end; port++) {
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

  // Ordena as portas numericamente
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
  const rows = ports.map(p => `
    <div class="row">
      <div class="port-info">
        <div class="port">${p.port}</div>
        <div class="service ${p.process.toLowerCase().replace(/[^a-z0-9]/g, '-')}">${p.process}</div>
      </div>
      <button class="open-btn" onclick="openPort('${p.port}')">
        <span class="arrow">→</span>
        <span class="tooltip">Open in browser</span>
      </button>
    </div>
  `).join('\n');

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
          padding: 8px;
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
          font-weight: bold;
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
        }
        /* Cores específicas para cada serviço */
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
        .nx {
          background-color: #143055;
          color: white;
        }
        .node-js {
          background-color: #68a063;
          color: white;
        }
        .spring-boot {
          background-color: #6db33f;
          color: white;
        }
        .python {
          background-color: #3776ab;
          color: white;
        }
        .net {
          background-color: #512bd4;
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
}

export function deactivate() {
  // Cleanup
}
