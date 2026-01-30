const logger = require('../utils/logger');
const { applyTemplate } = require('../campaign/templateEngine');
const { formatCorrelationTag } = require('../utils/correlation');
const ComplianceEngine = require('../compliance/engine');

class Dispatcher {
  constructor(loadBalancer) {
    this.loadBalancer = loadBalancer;
    this.compliance = new ComplianceEngine();
  }

  /**
   * Dispatches a single message with full Anti-Ban logic.
   * @param {object} payload - Dispatch payload.
   * @param {string} payload.phone - Target phone (55...)
   * @param {string} payload.messageTemplate - Message with Spintax
   * @param {object} payload.variables - Variables to render
   * @param {object} payload.correlation - Correlation metadata
   * @param {object} payload.delayConfig - Delay override (ms)
   * @param {boolean} payload.dryRun - If true, simulates sending.
   */
  async dispatch({
    phone,
    messageTemplate,
    variables = {},
    correlation = {},
    delayConfig = {},
    dryRun = false
  }) {
    const correlationTag = formatCorrelationTag(correlation.correlationId);

    // 1. Resolve Template + Spintax
    const finalMessage = applyTemplate(messageTemplate, variables);
    
    // 2. Select Chip (Load Balancing)
    const client = this.loadBalancer.getNextClient();
    if (!client) {
      throw new Error('No active sessions available for dispatch.');
    }

    if (client.waitUntilReady) {
      await client.waitUntilReady({ timeoutMs: 30000 });
    }

    // 3. Calculate Delays (Anti-Ban)
    this.compliance.setDelayRange(delayConfig);
    const typingTime = this.compliance.getTypingDelay(finalMessage);
    const postSendDelay = this.compliance.getVariableDelay();

    logger.info(`${correlationTag} [${client.id}] Dispatching to ${phone}... (Typing: ${typingTime}ms, Next Delay: ${postSendDelay}ms)`);

    let sendResult;
    if (!dryRun) {
        // Simulate typing delay for human-like behavior
        await new Promise(r => setTimeout(r, typingTime));
        
        // REAL SENDING
        sendResult = await client.sendMessage(phone, finalMessage, correlation);
        
        logger.info(`${correlationTag} [${client.id}] Sent to ${phone}: "${finalMessage}"`);
        if (client.enterCooldown) {
          await client.enterCooldown(postSendDelay, 'post_send_delay');
        }
    } else {
        logger.info(`${correlationTag} [DRY-RUN] Would send: "${finalMessage}" via ${client.id}`);
    }

    return {
      status: 'SERVER_ACK',
      chip: client.id,
      message: finalMessage,
      clientMessageId: correlation.clientMessageId,
      messageId: sendResult?.messageId,
      jid: sendResult?.jid,
      delays: { typing: typingTime, wait: postSendDelay }
    };
  }
}

module.exports = Dispatcher;
