const WhatsAppClient = require('./whatsappClient');
const logger = require('../utils/logger');

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.startingSessions = new Map();
    this.nextDisplayOrder = 1;
    this.isLoaded = false;
  }

  async startSession(id) {
    if (this.sessions.has(id)) {
      return this.sessions.get(id);
    }

    logger.info(`Starting session: ${id}`);
    const client = new WhatsAppClient(id);
    client.displayOrder = this.nextDisplayOrder;
    this.nextDisplayOrder += 1;
    this.sessions.set(id, client);

    // Initialize async (don't block)
    const initPromise = client.initialize().catch(err => {
      logger.error(`Failed to start session ${id}: ${err.message}`);
    }).finally(() => {
      this.startingSessions.delete(id);
    });
    this.startingSessions.set(id, initPromise);

    return client;
  }

  getSession(id) {
    return this.sessions.get(id);
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  getActiveSessions() {
    return this.getAllSessions().filter(client => client.isReady());
  }

  async waitForReady({ minReady = 1, timeoutMs = 60000 } = {}) {
    const hasEnoughReady = () => this.getActiveSessions().length >= minReady;
    if (hasEnoughReady()) {
      return this.getActiveSessions();
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`No sessions READY after ${timeoutMs}ms (minReady=${minReady}).`));
      }, timeoutMs);

      const handleStatus = () => {
        if (hasEnoughReady()) {
          cleanup();
          resolve(this.getActiveSessions());
        }
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        this.getAllSessions().forEach(client => {
          if (client.removeListener) {
            client.removeListener('status', handleStatus);
          }
        });
      };

      this.getAllSessions().forEach(client => {
        if (client.on) {
          client.on('status', handleStatus);
        }
      });
    });
  }
  
  async stopSession(id) {
    const client = this.sessions.get(id);
    if (!client) return;
    try {
      if (typeof client.shutdown === 'function') {
        await client.shutdown();
      }
    } catch (err) {
      logger.error(`Error destroying session ${id}: ${err.message}`);
    }
    this.sessions.delete(id);
    this.startingSessions.delete(id);
    logger.info(`Session ${id} stopped.`);
  }

  async loadSessions() {
    if (this.isLoaded) {
        return; // Already loaded, prevent duplication
    }

    try {
        const fs = require('fs');
        const pathHelper = require('../utils/pathHelper');

        const sessionsDir = pathHelper.getSessionsDir();
        if (!fs.existsSync(sessionsDir)) return;

        const entries = fs.readdirSync(sessionsDir, { withFileTypes: true })
          .filter(entry => entry.isDirectory() && entry.name.startsWith('session-'))
          .sort((a, b) => a.name.localeCompare(b.name));
        
        for (const entry of entries) {
            const id = entry.name.replace('session-', '');
            if (this.sessions.has(id) || this.startingSessions.has(id)) {
                logger.debug(`Session ${id} already loaded. Skipping restore.`);
                continue;
            }
            logger.info(`Found saved session: ${id}, restoring...`);
            await this.startSession(id);
        }
        this.isLoaded = true;
    } catch (error) {
        logger.error(`Error loading saved sessions: ${error.message}`);
    }
  }
}

module.exports = SessionManager;
