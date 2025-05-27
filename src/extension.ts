// Extensao VS Code - Visual moderno: lista portas com estilo e botão

import { exec } from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const provider = new LocalhostPortsProvider();
  vscode.window.registerTreeDataProvider('localhostPorts', provider);
  vscode.commands.registerCommand('localhostPorts.refresh', () => provider.refresh());
  vscode.commands.registerCommand('localhostPorts.open', (port: string) => {
    vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`));
  });

  provider.refresh();
}

class LocalhostPortsProvider implements vscode.TreeDataProvider<PortItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<PortItem | undefined | null> = new vscode.EventEmitter<PortItem | undefined | null>();
  readonly onDidChangeTreeData: vscode.Event<PortItem | undefined | null> = this._onDidChangeTreeData.event;

  private ports: PortInfo[] = [];

  refresh(): void {
    this.getListeningPorts().then((ports) => {
      this.ports = ports;
      vscode.window.showInformationMessage(`Detectadas ${ports.length} porta(s): ${ports.map(p => p.port).join(', ')}`);
      this._onDidChangeTreeData.fire(null);
    });
  }

  getTreeItem(element: PortItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<PortItem[]> {
    return Promise.resolve(this.ports.map(p => new PortItem(p)));
  }

  private getListeningPorts(): Promise<PortInfo[]> {
    return new Promise((resolve) => {
      const platform = os.platform();
      let command = '';

      if (platform === 'darwin' || platform === 'linux') {
        command = 'lsof -iTCP -sTCP:LISTEN -P -n';
      } else if (platform === 'win32') {
        command = 'netstat -ano';
      } else {
        vscode.window.showErrorMessage(`Sistema operacional não suportado: ${platform}`);
        return resolve([]);
      }

      exec(command, (err, stdout) => {
        if (err || !stdout) {
          vscode.window.showErrorMessage(`Erro ao executar comando: ${err}`);
          return resolve([]);
        }

        const map = new Map<string, string>();

        stdout.split('\n').forEach(line => {
          const portMatch = line.match(/:(\d+)/);
          const commandMatch = line.trim().split(/\s+/)[0];
          if (portMatch && portMatch[1]) {
            const port = portMatch[1];
            if (!isNaN(Number(port)) && Number(port) >= 80 && Number(port) <= 65535) {
              const label = commandMatch || 'desconhecida';
              map.set(port, label);
            }
          }

          if (line.includes('4200')) {
            map.set('4200', 'node');
          }
        });

        const result: PortInfo[] = Array.from(map.entries()).map(([port, proc]) => ({ port, process: proc }));
        resolve(result);
      });
    });
  }
}

class PortItem extends vscode.TreeItem {
  constructor(public readonly info: PortInfo) {
    super(`${info.port}`, vscode.TreeItemCollapsibleState.None);
    this.command = {
      command: 'localhostPorts.open',
      title: 'Abrir no navegador',
      arguments: [info.port]
    };
    this.tooltip = `http://localhost:${info.port}`;
    this.description = `${info.process}`;
    this.iconPath = new vscode.ThemeIcon('radio-tower', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
  }
}

interface PortInfo {
  port: string;
  process: string;
}

export function deactivate() {}
