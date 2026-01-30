const fs = require('fs');
const logger = require('../utils/logger');
const ExcelParser = require('../parser/excelParser');
const Dispatcher = require('../dispatch/dispatcher');
const SessionManager = require('../whatsapp/sessionManager');
const LoadBalancer = require('../whatsapp/loadBalancer');
const PathHelper = require('../utils/pathHelper');
const {
  createCampaignId,
  createContactId,
  createMessageId,
  buildCorrelationId,
  formatCorrelationTag
} = require('../utils/correlation');

class CampaignManager {
  constructor() {
    this.sessionManager = new SessionManager();
    this.loadBalancer = new LoadBalancer(this.sessionManager);
    this.dispatcher = new Dispatcher(this.loadBalancer);
    this.parser = new ExcelParser();
    this.stateFile = PathHelper.resolve('data', 'campaign_state.json');
    this.isPaused = false;
    this.eventEmitter = null;
    this.currentState = null;
    this.messageHandlers = new Map();
  }

  /**
   * Loads state from disk or creates new.
   */
  loadState() {
    if (fs.existsSync(this.stateFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      } catch (err) {
        logger.error(`Failed to load state: ${err.message}`);
      }
    }
    return {
      campaignId: null,
      processedRows: [],
      failedRows: [],
      pendingRows: [],
      messageStatus: {}
    };
  }

  saveState(state) {
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  /**
   * Initializes connections.
   */
  async initialize() {
    logger.info('Initializing Campaign Manager...');
    await this.sessionManager.loadSessions();

    this._attachMessageHandlers();
    
    // Wait for at least one READY session before allowing dispatch
    let sessions;
    try {
      sessions = await this.sessionManager.waitForReady({ minReady: 1, timeoutMs: 60000 });
    } catch (error) {
      logger.error(`Campaign init blocked: ${error.message}`);
      throw new Error('No READY sessions available. Please connect at least one chip.');
    }
    
    // Add sessions to LoadBalancer (filtering only ready ones ideally)
    // For now we assume they will connect.
    // sessions.forEach(s => {
    //    this.loadBalancer.addClient(s);
    // });
    // FIXED: LoadBalancer now pulls directly from sessionManager via DI
    
    logger.info(`${sessions.length} sessions detected for Load Balancer.`);

    logger.info(`${sessions.length} sessions loaded into Load Balancer.`);
  }

  /**
   * Starts or Resumes a campaign.
   * @param {string} excelPath 
   * @param {string} messageTemplate 
   */
  async startCampaign(excelPath, messageTemplate, originalFilename, options = {}) {
    const campaignId = options.campaignId || createCampaignId();
    const delayConfig = {
      minDelay: options.delayMin,
      maxDelay: options.delayMax
    };
    let state = this.loadState();
    state.campaignId = campaignId;
    this.currentState = state;
    
    // 1. Parse Excel
    const parseResult = await this.parser.parse(excelPath, originalFilename);
    if (parseResult.errors.length > 0) {
      logger.warn(`Found ${parseResult.errors.length} formatting errors in Excel. Check logs.`);
    }

    const allContacts = parseResult.contacts;
    
    // 2. Filter already processed
    const toProcess = allContacts.filter(c => !state.processedRows.includes(c.row));
    this._emitEvent('campaign_started', {
      campaignId,
      totalContacts: allContacts.length,
      remaining: toProcess.length
    });
    logger.info(`${formatCorrelationTag(campaignId)} Starting campaign. Total: ${allContacts.length}, Remaining: ${toProcess.length}`);

    // 3. Process Loop
    for (const contact of toProcess) {
       if (this.isPaused) {
         logger.info('Campaign PAUSED.');
         break;
       }

       try {
         const contactId = createContactId(contact.row);
         const clientMessageId = createMessageId();
         const correlationId = buildCorrelationId({
           campaignId,
           contactId,
           messageId: clientMessageId
         });
         const correlationTag = formatCorrelationTag(correlationId);

         const variables = {
           nome: contact.name,
           telefone: contact.phone,
           ...contact
         };

         const result = await this.dispatcher.dispatch({
           phone: contact.phone,
           messageTemplate,
           variables,
           correlation: {
             campaignId,
             contactId,
             clientMessageId,
             correlationId
           },
           delayConfig
         });

         state.messageStatus[clientMessageId] = {
           campaignId,
           contactId,
           phone: contact.phone,
           status: result.status,
           updatedAt: new Date().toISOString()
         };

         this._emitEvent('message_status', {
           campaignId,
           contactId,
           clientMessageId,
           correlationId,
           status: result.status,
           phone: contact.phone
         });
         
         if (result.status === 'SERVER_ACK') {
            state.processedRows.push(contact.row);
            logger.info(`${correlationTag} Row ${contact.row} server ack -> ${contact.phone}`);
         }
       } catch (err) {
         const contactId = createContactId(contact.row);
         logger.error(`${formatCorrelationTag(buildCorrelationId({ campaignId, contactId }))} Failed Row ${contact.row} (${contact.phone}): ${err.message}`);
         state.failedRows.push({ row: contact.row, error: err.message });
         // We might mark as processed to skip next time, or keep to retry. 
         // For now, let's mark processed so we don't loop forever on bad numbers.
         state.processedRows.push(contact.row); 
       }

       // Save state after each step for resilience
       this.saveState(state);
    }

    this._emitEvent('campaign_finished', {
      campaignId,
      processed: state.processedRows.length,
      failed: state.failedRows.length
    });
    logger.info(`${formatCorrelationTag(campaignId)} Campaign execution finished or paused.`);
    return { campaignId };
  }

  setEventEmitter(emitter) {
    this.eventEmitter = emitter;
  }

  _emitEvent(event, payload) {
    if (this.eventEmitter && typeof this.eventEmitter.emit === 'function') {
      this.eventEmitter.emit(event, payload);
    }
  }

  _attachMessageHandlers() {
    this.sessionManager.getAllSessions().forEach((client) => {
      this.registerSessionClient(client);
    });
  }

  registerSessionClient(client) {
    if (!client || this.messageHandlers.has(client.id)) {
      return;
    }

    const handler = (update) => {
      const key = update.clientMessageId || update.messageId;
      if (key && this.currentState?.messageStatus?.[key]) {
        this.currentState.messageStatus[key] = {
          ...this.currentState.messageStatus[key],
          status: update.status,
          updatedAt: new Date().toISOString()
        };
        this.saveState(this.currentState);
      }
      this._emitEvent('message_status', update);
    };

    client.on('message_status', handler);
    this.messageHandlers.set(client.id, handler);
  }
}

module.exports = CampaignManager;
