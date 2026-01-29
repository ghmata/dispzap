const logger = require('../utils/logger');
const SpintaxParser = require('../campaign/spintax');
const ComplianceEngine = require('../compliance/engine');

class Dispatcher {
  constructor(loadBalancer) {
    this.loadBalancer = loadBalancer;
    this.compliance = new ComplianceEngine();
  }

  /**
   * Dispatches a single message with full Anti-Ban logic.
   * @param {string} phone - Target phone (55...)
   * @param {string} messageTemplate - Message with Spintax
   * @param {boolean} dryRun - If true, simulates sending.
   */
  async dispatch(phone, messageTemplate, dryRun = false) {
    // 1. Resolve Spintax
    const finalMessage = SpintaxParser.parse(messageTemplate);
    
    // 2. Select Chip (Load Balancing)
    const client = this.loadBalancer.getNextClient();
    if (!client) {
      throw new Error('No active sessions available for dispatch.');
    }

    // 3. Calculate Delays (Anti-Ban)
    const typingTime = this.compliance.getTypingDelay(finalMessage);
    const postSendDelay = this.compliance.getVariableDelay();

    logger.info(`[${client.id}] Dispatching to ${phone}... (Typing: ${typingTime}ms, Next Delay: ${postSendDelay}ms)`);

    if (!dryRun) {
        // Simulate typing delay for human-like behavior
        await new Promise(r => setTimeout(r, typingTime));
        
        // REAL SENDING
        // Ensure format is correct: 55... @c.us
        const chatId = `${phone}@c.us`; 
        await client.sendMessage(chatId, finalMessage);
        
        logger.info(`[${client.id}] Sent to ${phone}: "${finalMessage}"`);
    } else {
        logger.info(`[DRY-RUN] Would send: "${finalMessage}" via ${client.id}`);
    }

    return {
      status: 'SENT',
      chip: client.id,
      message: finalMessage,
      delays: { typing: typingTime, wait: postSendDelay }
    };
  }
}

module.exports = Dispatcher;
