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
- [ ] Migrar cores para tokens de tema VS Code
- [ ] Compatibilidade com tema claro/escuro/alto contraste
- [ ] Estado de loading durante atualizacao
- [ ] Estado vazio (nenhuma porta ativa)
- [ ] Estado de erro amigavel com acao de retry

### 5. Interacoes e produtividade
- [ ] Acao para copiar URL
- [ ] Acao para copiar apenas a porta
- [ ] Acao para abrir no browser interno/externo (configuravel)
- [ ] Acao para encerrar processo com confirmacao
- [ ] Busca/filtro por nome de servico/framework/porta
- [ ] Filtro rapido (Node, bancos, web servers, outros)
- [ ] Favoritar portas
- [ ] Preservar scroll/estado visual entre refreshes

---

## Fase 3 - Marketplace Growth (Mais downloads)

### 6. Otimizacao da pagina da extensao
- [ ] Corrigir `repository.url` real no `package.json`
- [ ] Ajustar categoria(s) da extensao (evitar apenas `Other`)
- [ ] Adicionar `keywords` focadas em busca (localhost, ports, dev server, etc.)
- [ ] Corrigir consistencia de publisher/nome no README
- [ ] Atualizar badge de versao no README
- [ ] Incluir GIF curto de demonstracao (5-10s)
- [ ] Atualizar screenshots reais da UX atual
- [ ] Melhorar descricao com proposta de valor clara no primeiro bloco

### 7. Confianca e prova social
- [ ] Organizar CHANGELOG por versao (padrao Keep a Changelog)
- [ ] Criar issue templates por OS
- [ ] Criar release notes mais detalhadas por versao
- [ ] Adicionar CTA discreto para review apos usos bem-sucedidos
- [ ] Telemetria opcional e anonima (se decidir usar)

---

## Fase 4 - Ecossistema e diferenciacao

### 8. Deteccao de frameworks/servicos (expansao)
- [ ] Melhorar deteccao de Next.js
- [ ] Melhorar deteccao de Nuxt
- [ ] Melhorar deteccao de Vite
- [ ] Melhorar deteccao de Spring Boot
- [ ] Melhorar deteccao de Laravel
- [ ] Melhorar deteccao de Rails
- [ ] Melhorar deteccao de apps Go

### 9. Ambientes de desenvolvimento
- [ ] Validar comportamento em WSL
- [ ] Validar comportamento em Dev Containers
- [ ] Validar comportamento em SSH Remote
- [ ] Documentar limitacoes e boas praticas para cada ambiente

---

## Plano de execucao (30 dias)
- [ ] Semana 1: Coleta por OS + timeout + anti-overlap
- [ ] Semana 2: UI por tema + estados (loading/vazio/erro)
- [ ] Semana 3: Acoes rapidas + cache PID + melhorias de refresh
- [ ] Semana 4: Marketplace (README, GIF, changelog, release notes)

---

## Diario de progresso

### Dia 1
- [ ] Itens concluidos:
- [ ] Bloqueios:
- [ ] Proximo passo:

### Dia 2
- [ ] Itens concluidos:
- [ ] Bloqueios:
- [ ] Proximo passo:

### Dia 3
- [ ] Itens concluidos:
- [ ] Bloqueios:
- [ ] Proximo passo:

(Adicione novos dias conforme avancar.)
