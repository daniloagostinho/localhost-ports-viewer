"use strict";
// Extensao VS Code - Visual moderno: lista portas com estilo e botão
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const child_process_1 = require("child_process");
const os = __importStar(require("os"));
const vscode = __importStar(require("vscode"));
function activate(context) {
    const provider = new LocalhostPortsProvider();
    vscode.window.registerTreeDataProvider('localhostPorts', provider);
    vscode.commands.registerCommand('localhostPorts.refresh', () => provider.refresh());
    vscode.commands.registerCommand('localhostPorts.open', (port) => {
        vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`));
    });
    provider.refresh();
}
class LocalhostPortsProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    ports = [];
    refresh() {
        this.getListeningPorts().then((ports) => {
            this.ports = ports;
            vscode.window.showInformationMessage(`Detectadas ${ports.length} porta(s): ${ports.map(p => p.port).join(', ')}`);
            this._onDidChangeTreeData.fire(null);
        });
    }
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        return Promise.resolve(this.ports.map(p => new PortItem(p)));
    }
    getListeningPorts() {
        return new Promise((resolve) => {
            const platform = os.platform();
            let command = '';
            if (platform === 'darwin' || platform === 'linux') {
                command = 'lsof -iTCP -sTCP:LISTEN -P -n';
            }
            else if (platform === 'win32') {
                command = 'netstat -ano';
            }
            else {
                vscode.window.showErrorMessage(`Sistema operacional não suportado: ${platform}`);
                return resolve([]);
            }
            (0, child_process_1.exec)(command, (err, stdout) => {
                if (err || !stdout) {
                    vscode.window.showErrorMessage(`Erro ao executar comando: ${err}`);
                    return resolve([]);
                }
                const map = new Map();
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
                const result = Array.from(map.entries()).map(([port, proc]) => ({ port, process: proc }));
                resolve(result);
            });
        });
    }
}
class PortItem extends vscode.TreeItem {
    info;
    constructor(info) {
        super(`${info.port}`, vscode.TreeItemCollapsibleState.None);
        this.info = info;
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
function deactivate() { }
//# sourceMappingURL=extension.js.map