// Extensão VS Code com WebviewViewProvider no painel lateral (visual premium)

import psList from 'ps-list';
import tcpPortUsed from 'tcp-port-used';
import * as vscode from 'vscode';

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

async function getListeningPorts(): Promise<PortInfo[]> {
  const knownPorts = [
    80, 443, // HTTP/HTTPS
    3000, 3001, 3002, 3003, // React, Express, etc
    4000, 4001, 4200, 4300, // Angular, Ember, etc
    5000, 5001, 5002, 5432, // .NET, Python, PostgreSQL
    6000, 6001, 6379, // Redis
    7000, 7001, // Various services
    8000, 8001, 8080, 8081, 8082, // Dev servers
    9000, 9001, 9090, // Various services
    27017 // MongoDB
  ];
  const result: PortInfo[] = [];
  const processes = await psList();

  for (const port of knownPorts) {
    const [v4, v6] = await Promise.all([
      tcpPortUsed.check(port, '127.0.0.1'),
      tcpPortUsed.check(port, '::1')
    ]);
    const inUse = v4 || v6;

    if (inUse) {
      result.push({ port: port.toString(), process: 'PORT IN USE' });
    }
  }

  return result;
}

function getWebviewContent(ports: PortInfo[]): string {
  const rows = ports.map(p => `
    <div class="row">
      <div class="port">${p.port}</div>
      <button onclick="openPort('${p.port}')">→</button>
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
          font-family: sans-serif;
          padding: 16px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
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
          margin-bottom: 5px;
          gap: 8px;
          width: fit-content;
        }
        .port {
          background-color: #00c853;
          color: white;
          font-weight: bold;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 16px;
          min-width: 60px;
          text-align: center;
        }
        button {
          background: none;
          border: none;
          color: #ccc;
          font-size: 18px;
          cursor: pointer;
          padding: 6px;
        }
        button:hover {
          color: white;
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
