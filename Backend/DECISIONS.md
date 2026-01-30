# Architectural Decision Records (ADR) - Dia 1

## 1. Tratamento de Caminhos (Paths)
**Decisão:** Utilização de caminhos relativos baseados em `process.cwd()` via `PathHelper`.
**Motivo:** O requisito de "App Portátil" exige que o software funcione em qualquer diretório (ex: Pendrive, D:/), sem depender de variáveis de ambiente do sistema ou caminhos absolutos fixos (`C:\Program Files`).
**Impacto:** Todas as referências a arquivos (logs, sessões, configs) devem passar pelo `pathHelper`.

## 2. Motor de Leitura Excel (ExcelJS)
**Decisão:** Uso da biblioteca `exceljs` padrão (readFile) em vez de Streaming.
**Motivo:** O volume de dados esperado (< 5.000 linhas) não justifica a complexidade de implementação de Streams, que dificultaria a validação robusta de colunas. O método `readFile` carrega em memória mas é suficientemente performático para o escopo.
**Impacto:** Código mais limpo e fácil de manter. Limitação teórica de memória em arquivos gigantes (>100k linhas), irrelevante para o caso de uso.

## 3. Estrutura de Logs (Winston)
**Decisão:** Separação de arquivos de erro e aplicação com rotação diária.
**Motivo:** Facilitar o suporte técnico. Arquivos de log únicos tendem a crescer indefinidamente em servidores Windows, causando problemas de I/O. A rotação (7 dias) garante limpeza automática.
**Impacto:** Instalação da dependência `winston-daily-rotate-file`.

## 4. Sanitização de Telefones
**Decisão:** Adoção de Regex estrito (`^55\d{10,11}$`) com auto-correção conservadora.
**Motivo:** Evitar banimentos por tentativa de envio para números inexistentes/fixos. Se o usuário digitar sem "55", o sistema adiciona. Se digitar algo fora do padrão móvel (celular), rejeita.
**Impacto:** Maior confiabilidade na taxa de entrega.

## 5. Abstração de Provider (Baileys)
**Decisão:** `WhatsAppClient` passou a encapsular uma interface `WhatsAppProvider` com implementação `BaileysProvider`.
**Motivo:** Desacoplar a lógica anti-ban e a state machine do provedor WhatsApp, permitindo troca futura de biblioteca sem reescrever o domínio.

## 6. Persistência de Sessão
**Decisão:** Armazenamento em pastas separadas (`data/sessions/{id}`) por chip.
**Motivo:** Isolamento total. Se a sessão do "chip 1" corromper, basta deletar a pasta `chip_1` sem afetar o `chip_2`.

## 7. Algoritmo de Delay (Box-Muller)
**Decisão:** Uso de distribuição normal em vez de `Math.random()` puro (Uniforme).
**Motivo:** Robôs simples usam random linear (ex: qualquer número entre 5s e 10s tem chance igual). Humanos tendem a ter uma média (curva de sino). Isso dificulta a detecção por "impressão digital" estatística do WhatsApp.

## 8. Spintax Recursivo
**Decisão:** Suporte a aninhamento `{A|{B|C}}`.
**Motivo:** Permitir variações complexas de frase para garantir que o hash da mensagem final seja quase sempre único.
