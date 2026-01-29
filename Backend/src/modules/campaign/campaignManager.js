const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const ExcelParser = require('../parser/excelParser');
const Dispatcher = require('../dispatch/dispatcher');
const SessionManager = require('../whatsapp/sessionManager');
const LoadBalancer = require('../whatsapp/loadBalancer');
const PathHelper = require('../utils/pathHelper');

class CampaignManager {
  constructor() {
    this.sessionManager = new SessionManager();
    this.loadBalancer = new LoadBalancer(this.sessionManager);
    this.dispatcher = new Dispatcher(this.loadBalancer);
    this.parser = new ExcelParser();
    this.stateFile = PathHelper.resolve('data', 'campaign_state.json');
    this.isPaused = false;
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
    return { processedRows: [], failedRows: [], pendingRows: [] };
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
    
    // Wait for sessions to be ready (simplified for Day 4 demo)
    // In production, we might want a more robust wait mechanism
    const sessions = this.sessionManager.getActiveSessions();
    if (sessions.length === 0) {
      throw new Error('No sessions found. Please run multisession setup first.');
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
  async startCampaign(excelPath, messageTemplate, originalFilename) {
    let state = this.loadState();
    
    // 1. Parse Excel
    const parseResult = await this.parser.parse(excelPath, originalFilename);
    if (parseResult.errors.length > 0) {
      logger.warn(`Found ${parseResult.errors.length} formatting errors in Excel. Check logs.`);
    }

    const allContacts = parseResult.contacts;
    
    // 2. Filter already processed
    const toProcess = allContacts.filter(c => !state.processedRows.includes(c.row));
    logger.info(`Starting campaign. Total: ${allContacts.length}, Remaining: ${toProcess.length}`);

    // 3. Process Loop
    for (const contact of toProcess) {
       if (this.isPaused) {
         logger.info('Campaign PAUSED.');
         break;
       }

       try {
         // Dispatch
         // Replace variables in template
         let msg = messageTemplate
           .replace('{nome}', contact.name || '')
           .replace('{link}', contact.link || '');
            // Dynamic replacement for other cols could go here

         const result = await this.dispatcher.dispatch(contact.phone, msg); // Pass actual dispatch options
         
         if (result.status === 'SENT') {
            state.processedRows.push(contact.row);
            logger.info(`Row ${contact.row} success -> ${contact.phone}`);
         }
       } catch (err) {
         logger.error(`Failed Row ${contact.row} (${contact.phone}): ${err.message}`);
         state.failedRows.push({ row: contact.row, error: err.message });
         // We might mark as processed to skip next time, or keep to retry. 
         // For now, let's mark processed so we don't loop forever on bad numbers.
         state.processedRows.push(contact.row); 
       }

       // Save state after each step for resilience
       this.saveState(state);
    }

    logger.info('Campaign execution finished or paused.');
  }
}

module.exports = CampaignManager;
