# Plano de Melhorias - Localhost Ports Viewer

Atualizado em: 2026-03-13

## Como usar
- Marque com `[x]` quando concluir uma tarefa.
- Se quebrar uma tarefa grande, adicione subtarefas logo abaixo.
- Atualize este arquivo no fim de cada dia com o progresso.

## Ponto de observacao - Implementacao com IA (sem quebrar)

Use estas regras sempre que a IA for aplicar melhorias no projeto:

- [ ] Fazer mudancas pequenas e incrementais (uma melhoria por vez)
- [ ] Evitar refatoracao grande em lote sem necessidade
- [ ] Preservar comportamento atual antes de otimizar
- [ ] Rodar build/lint apos cada bloco de alteracoes
- [ ] Se aparecer regressao, corrigir antes de seguir para a proxima tarefa
- [ ] Priorizar metodos pequenos, com responsabilidade unica
- [ ] Reutilizar funcoes utilitarias para evitar codigo duplicado
- [ ] Evitar redundancia e repeticao de logica
- [ ] Manter nomes claros e intencao explicita no codigo
- [ ] Evitar complexidade desnecessaria (sem overengineering)
- [ ] Preferir composicao simples em vez de estruturas muito acopladas
- [ ] Garantir que cada mudanca melhore manutencao e escalabilidade

### Check rapido por PR/commit
- [ ] Metodo novo com no maximo complexidade baixa e foco unico
- [ ] Nao criou duplicacao evitavel
- [ ] Nao aumentou acoplamento entre modulos
- [ ] Nao quebrou comportamento existente
- [ ] Codigo ficou mais legivel do que antes

## Objetivo
Melhorar confiabilidade cross-OS (Windows/macOS/Linux), experiencia de uso no VS Code e conversao no Marketplace para aumentar downloads e retencao.

### Regra de execucao sugerida
- [ ] Sempre puxar primeiro itens do Top 10 antes das fases detalhadas
- [ ] Ao concluir um Top item, marcar tambem os itens equivalentes nas fases abaixo

---

## Fase 1 - Base tecnica (Confiabilidade + Performance)

### 1. Coleta de portas por sistema operacional
- [x] Windows: substituir uso de `wmic` por PowerShell (`Get-NetTCPConnection` + `Get-Process`)
- [x] Linux: priorizar `ss -lntp` e manter fallback para `lsof`
- [x] macOS: padronizar parser de `lsof` para LISTEN (`lsof -iTCP -sTCP:LISTEN -P -n`)
- [x] Criar adaptadores separados por OS (arquitetura por providers)
- [x] Adicionar timeout por comando para evitar travamentos
- [x] Adicionar fallback inteligente sem escanear range total imediatamente

### 2. Performance de atualizacao
- [x] Evitar refresh concorrente (se ja estiver atualizando, ignorar novo ciclo)
- [x] Cache de identificacao por PID com TTL (10-20s)
- [ ] Limitar concorrencia da deteccao de servicos
- [ ] Reduzir custo por refresh (nao reconstruir tudo sem necessidade)
- [x] Configuracao de intervalo de refresh no `settings.json`

### 3. Robustez e seguranca
- [x] Validar porta antes de abrir URL
- [x] Escapar strings renderizadas no HTML (process/framework)
- [x] Adicionar Content Security Policy no webview
- [ ] Mensagens de erro claras (permissao, comando indisponivel, timeout)
- [x] Logs de debug opcionais via configuracao

---

## Fase 2 - UX/UI (Aparencia + Comportamento)

### 4. Interface nativa VS Code
- [x] Migrar cores para tokens de tema VS Code
- [x] Compatibilidade com tema claro/escuro/alto contraste
- [x] Estado de loading durante atualizacao
- [x] Estado vazio (nenhuma porta ativa)
- [x] Estado de erro amigavel com acao de retry

### 5. Interacoes e produtividade
- [x] Acao para copiar URL
- [x] Acao para copiar apenas a porta
- [x] Acao para abrir no browser interno/externo (configuravel)
- [x] Acao para encerrar processo com confirmacao
- [x] Busca/filtro por nome de servico/framework/porta
- [x] Filtro rapido (Node, bancos, web servers, outros)
- [x] Favoritar portas
- [x] Preservar scroll/estado visual entre refreshes

---

## Fase 3 - Marketplace Growth (Mais downloads)

### 6. Otimizacao da pagina da extensao
- [x] Corrigir `repository.url` real no `package.json`
- [x] Ajustar categoria(s) da extensao (evitar apenas `Other`)
- [x] Adicionar `keywords` focadas em busca (localhost, ports, dev server, etc.)
- [x] Corrigir consistencia de publisher/nome no README
- [x] Atualizar badge de versao no README
- [ ] Incluir GIF curto de demonstracao (5-10s) — pendente: gravar manualmente
- [ ] Atualizar screenshots reais da UX atual — pendente: capturar manualmente
- [x] Melhorar descricao com proposta de valor clara no primeiro bloco

### 7. Confianca e prova social
- [x] Organizar CHANGELOG por versao (padrao Keep a Changelog)
- [x] Criar issue templates por OS (macOS, Linux, Windows, feature request)
- [x] Criar release notes mais detalhadas por versao
- [x] Adicionar CTA discreto para review apos usos bem-sucedidos (no README)
- [ ] Telemetria opcional e anonima (se decidir usar)

---

## Fase 4 - Ecossistema e diferenciacao

### 8. Deteccao de frameworks/servicos (expansao)
- [x] Melhorar deteccao de Next.js
- [x] Melhorar deteccao de Nuxt
- [x] Melhorar deteccao de Vite
- [x] Melhorar deteccao de Spring Boot
- [x] Melhorar deteccao de Laravel
- [x] Melhorar deteccao de Rails
- [x] Melhorar deteccao de apps Go
- [x] Substituir ls node_modules por leitura de package.json (mais rapido e preciso)
- [x] Adicionar deteccao de: Remix, Svelte, Fastify, Hono, Elysia, Nginx, Apache

### 9. Ambientes de desenvolvimento
- [x] Validar comportamento em WSL (detecta ambiente via `vscode.env.remoteName`, fallback `docker.exe` para Docker Desktop WSL integration, badge 🐧 WSL no header)
- [x] Validar comportamento em Dev Containers (detecta containers Docker via `docker ps`, mostra nome do container e imagem, categoria Docker no filtro)
- [x] Validar comportamento em SSH Remote (detecta ambiente via `vscode.env.remoteName`, badge 🔑 SSH Remote no header, comandos executam no host remoto)
- [x] Documentar limitacoes e boas praticas para cada ambiente (seção "Supported Environments" no README)

---

## Plano de execucao (30 dias)
- [ ] Semana 1: Coleta por OS + timeout + anti-overlap
- [ ] Semana 2: UI por tema + estados (loading/vazio/erro)
- [ ] Semana 3: Acoes rapidas + cache PID + melhorias de refresh
- [ ] Semana 4: Marketplace (README, GIF, changelog, release notes)

---

## Bugs identificados (2026-06-19 - analise completa)

Prioridade alta:
- [x] **Nomes truncados (causa do "APP_INKWE")** — `lsof` corta a coluna COMMAND em 9 chars
      (`app_inkwell` -> `app_inkwe`); `ss` corta em ~15. Resolvido usando `ps-list`
      (ja era dependencia, nao estava sendo usada) para resolver nome/cmd completos por PID.
- [x] **`refreshInterval` era config morta** — nao existia nenhum `setInterval`; a config
      "Auto-refresh interval" nao fazia nada. Implementado auto-refresh real, ativo apenas
      quando a view esta visivel, reiniciando ao mudar o intervalo.

Pendentes (encontrados, ainda nao corrigidos):
- [x] Cache de PID nunca acertava no caminho Docker — agora chaveado por `pid:port`
      em leitura e escrita (um proxy Docker serve varias portas/containers)
- [x] HTML do webview nao escapava `label`/`data-label` — adicionado `esc()` no webview
- [x] `cat "${cwd}/package.json"` via shell — trocado por `fs.readFile` + `path.join`
- [x] Windows: `Get-Process` nao expoe `CommandLine` no PS 5.1 — agora `Get-CimInstance Win32_Process`
- [x] Deteccao de servicos sequencial — `mapWithConcurrency` (limite 8), preserva ordem
- [x] `docker ps` rodando todo refresh sem Docker — negative cache de 60s (`dockerUnavailableUntil`)
- [ ] `extractProjectDirFromCmd` so casa caminhos Unix, nunca `C:\`
- [ ] Infra de teste quebrada: `out/test/extension.test.js` e CJS sob pacote `type: module`
      e nao ha `src/test/*.ts` para recompilar

## Diario de progresso

### Dia 1 (2026-06-19)
- [x] Itens concluidos: fix dos nomes truncados via ps-list (validado ao vivo: porta 49193
      app_inkwe -> app_inkwell) + auto-refresh real respeitando visibilidade da view
- [x] Tambem: escape de HTML no webview + chave do cache Docker corrigida (pid:port)
- [x] Robustez: fs.readFile, Windows CommandLine via CIM, concorrencia limitada,
      docker ps com negative cache de 60s
- [ ] Bloqueios: `npm test` falha por infra pre-existente (nao relacionada)
- [ ] Proximo passo: suportar caminhos Windows em extractProjectDirFromCmd;
      consertar infra de teste (criar src/test/*.ts ESM)

### Dia 2
- [ ] Itens concluidos:
- [ ] Bloqueios:
- [ ] Proximo passo:

### Dia 3
- [ ] Itens concluidos:
- [ ] Bloqueios:
- [ ] Proximo passo:

(Adicione novos dias conforme avancar.)
