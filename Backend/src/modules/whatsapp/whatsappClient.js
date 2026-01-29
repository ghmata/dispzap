const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('../utils/logger');
const pathHelper = require('../utils/pathHelper');
const path = require('path');

class WhatsAppClient {
  constructor(id) {
    this.id = id;
    this.status = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, READY
    
    // Ensure portable session path
    const sessionPath = pathHelper.getSessionsDir();

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: id,
        dataPath: sessionPath
      }),
      // Reverted: v1.26.0 should work natively. Forcing old version might be the issue.
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    this._bindEvents();
  }

  _bindEvents() {
    this.client.on('qr', (qr) => {
      this.status = 'WAITING_QR';
      logger.info(`[${this.id}] QR Code received. Please scan.`);
      qrcode.generate(qr, { small: true });
    });

    this.client.on('loading_screen', (percent, message) => {
      logger.info(`[${this.id}] Loading: ${percent}% - ${message}`);
    });

    this.client.on('ready', () => {
      this.status = 'READY';
      logger.info(`[${this.id}] Client is ready!`);
    });

    this.client.on('authenticated', () => {
      this.status = 'AUTHENTICATED';
      logger.info(`[${this.id}] Client authenticated.`);
      
      // Fallback: If READY doesn't fire in 30s, check if we can actually use the client
      // Fallback: If READY doesn't fire in 30s, check if we can actually use the client
      // WARNING: Forcing READY without the event caused crashes (sendSeen undefined).
      // We will only log the delay, not force state.
      setTimeout(async () => {
          if (this.status === 'AUTHENTICATED') {
              logger.warn(`[${this.id}] WAITING FOR READY... (Client stalled at AUTHENTICATED). This usually means the session is corrupt or WWebJS needs an update.`);
          }
      }, 30000);
    });

    this.client.on('auth_failure', (msg) => {
      this.status = 'AUTH_FAILURE';
      logger.error(`[${this.id}] Authentication failure: ${msg}`);
    });

    this.client.on('change_state', (state) => {
      logger.info(`[${this.id}] Connection state changed: ${state}`);
      // If phone disconnects, state might go to TIMEOUT or unknown
    });

    this.client.on('disconnected', (reason) => {
      this.status = 'DISCONNECTED';
      logger.warn(`[${this.id}] Client disconnected: ${reason}`);
    });
  }

  async initialize() {
    logger.info(`[${this.id}] Initializing...`);
    this.status = 'CONNECTING';
    try {
      await this.client.initialize();
    } catch (error) {
      logger.error(`[${this.id}] Init error: ${error.message}`);
      this.status = 'ERROR';
    }
  }

  async sendMessage(to, message) {
    if (this.status !== 'READY') {
      throw new Error(`Client ${this.id} is not ready (Status: ${this.status})`);
    }
    
    // Resolve ID to avoid "No LID" error
    let chatId = to;
    
    // If it looks like a phone number (digits only or digits+@c.us)
    const cleanNumber = to.replace('@c.us', '');
    if (/^\d+$/.test(cleanNumber)) {
        try {
            const registered = await this.client.getNumberId(cleanNumber);
            if (registered) {
                chatId = registered._serialized;
            } else {
                logger.warn(`[${this.id}] Number ${cleanNumber} not registered on WhatsApp. Attempting to send anyway...`);
                chatId = `${cleanNumber}@c.us`;
            }
        } catch (e) {
            logger.warn(`[${this.id}] ID Resolution failed for ${cleanNumber}: ${e.message}`);
             // If resolution fails, fallback to standard format
             chatId = `${cleanNumber}@c.us`;
        }
    }

    return this.client.sendMessage(chatId, message);
  }

  isReady() {
    return this.status === 'READY';
  }

  getPhoneNumber() {
      if (this.client && this.client.info && this.client.info.wid) {
          return this.client.info.wid.user;
      }
      return null;
  }
}

module.exports = WhatsAppClient;
