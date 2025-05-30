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
  async resolveWebviewView(webviewView: vscode.WebviewView) {
    const ports = await getListeningPorts();

    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = getWebviewContent(ports);

    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'open') {
        vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${msg.port}`));
      }
    });
  }
}

async function getListeningPorts(): Promise<PortInfo[]> {
  const knownPorts = [80, 3000, 3001, 4000, 4200, 5000, 5432, 6000, 7000, 8080, 9000];
  const result: PortInfo[] = [];
  const processes = await psList();

  const fallbackNames: Record<string, string> = {
    '4200': 'Angular',
    '5432': 'Postgres',
    '5000': 'Node/Express',
    '7000': 'ControlCe',
    '8080': 'http-server'
  };

  for (const port of knownPorts) {
    // Verifica IPv4 e IPv6
    const [v4, v6] = await Promise.all([
      tcpPortUsed.check(port, '127.0.0.1'),
      tcpPortUsed.check(port, '::1')
    ]);
    const inUse = v4 || v6;

    if (inUse) {
      const match = processes.find(p => p.cmd?.includes(port.toString()));
      const processName = match?.name || fallbackNames[port.toString()] || 'Unknown';
      result.push({ port: port.toString(), process: processName });
    }
  }

  return result;
}

function getWebviewContent(ports: PortInfo[]): string {
  const rows = ports.map(p => `
    <div class="row">
      <div class="port">${p.port}</div>
      <div class="label">${p.process.toUpperCase()}</div>
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
        .row {
          display: flex;
          align-items: center;
          margin-bottom: 12px;
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
        .label {
          margin-left: 12px;
          font-size: 14px;
          flex-grow: 1;
        }
        button {
          background: none;
          border: none;
          color: #ccc;
          font-size: 18px;
          cursor: pointer;
        }
        button:hover {
          color: white;
        }
      </style>
    </head>
    <body>
      <h3>LOCALHOST: LOCALHOST PORTS</h3>
      ${rows}
      <script>
        const vscode = acquireVsCodeApi();
        function openPort(port) {
          vscode.postMessage({ command: 'open', port });
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

export function deactivate() {}
