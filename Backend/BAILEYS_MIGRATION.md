# Migração Segura para Baileys (Anti-Ban)

## Diagnóstico: diferenças críticas (whatsapp-web.js vs Baileys)

1. **Dependência de DOM vs. Socket nativo**
   - `whatsapp-web.js` depende de Chromium/Puppeteer e DOM, sujeito a quebras silenciosas com atualizações do WhatsApp Web.
   - Baileys usa protocolo reverso via socket, sem DOM, reduzindo superfícies de falha e instabilidades de renderização.

2. **Gestão de sessão**
   - `whatsapp-web.js` usa `LocalAuth` baseado em arquivos do Chromium; falhas/corrupções costumam causar “READY travado”.
   - Baileys usa **Multi-File Auth State**, permitindo isolamento por chip e controle explícito do ciclo de vida da sessão.

3. **Observabilidade e controle**
   - Eventos e reconexões são mais previsíveis no Baileys (com `connection.update`), permitindo **state machine** explícita e política anti-ban auditável.

4. **Risco de ban**
   - Com DOM, a automação precisa simular browser; com Baileys, a responsabilidade pela **humanização** e **rate-limit** é totalmente do servidor.
   - Baileys permite bloquear envios de forma determinística em desconexões e erros suspeitos.

---

## Arquitetura proposta (com abstração)

```
┌────────────────────┐
│  Campaign Manager  │
└─────────┬──────────┘
          │
          v
┌────────────────────┐
│     Dispatcher     │
│ (Anti-ban delays)  │
└─────────┬──────────┘
          │
          v
┌─────────────────────────────┐
│    WhatsAppClient (FSM)     │
│  - State Machine            │
│  - Rate Limit / Cooldown    │
└─────────┬───────────────────┘
          │
          v
┌─────────────────────────────┐
│   WhatsAppProvider (接口)   │
│  - BaileysProvider           │
│  - (futuro: outro provider)  │
└─────────────────────────────┘
```

**Estado explícito (FSM):**

```
INIT → AUTHENTICATING → CONNECTED → READY → IDLE
  ↘                                ↘
   ERROR ← SENDING ← COOLDOWN ←─────┘
  ↘
DISCONNECTED
```

Envios somente quando **READY**. `IDLE` transiciona para `READY` no início do envio.

---

## Anti-Ban (camadas implementadas)

1. **Delays randômicos reais**
   - Typing delay (simulação de digitação).
   - Post-send delay aleatório por chip (cooldown).

2. **Rate limiting por chip**
   - Janela horária e diária.
   - Bloqueio automático e cooldown com jitter.

3. **Bloqueio por estado**
   - Envio bloqueado fora do estado `READY`.
   - Em `ERROR` ou `DISCONNECTED`, envio negado.

4. **Reconexão controlada**
   - Reconnect com jitter e limite máximo.
   - Bloqueio permanente ao exceder limite.

5. **Validação de número**
   - `onWhatsApp` antes de enviar.
   - Falha -> ERROR + log crítico.

---

## Checklist de segurança anti-ban

- [ ] Envio bloqueado fora de `READY`.
- [ ] Cooldown aleatório após cada envio.
- [ ] Rate limit diário e por hora por chip.
- [ ] Bloqueio por desconexão e erro suspeito.
- [ ] Reconexão limitada com jitter.
- [ ] Não reutilizar sessão de forma insegura.
- [ ] Logs estruturados para auditoria.

---

## Checklist de validação antes de produção

- [ ] Testar READY → SEND em ambiente controlado.
- [ ] Simular cooldown e rate limit com números de teste.
- [ ] Verificar bloqueio por erro de sessão.
- [ ] Confirmar que QR e autenticação são persistidos.
- [ ] Validar logs de mudança de estado e tentativa de envio.
- [ ] Validar que não há loops de envio contínuo.
