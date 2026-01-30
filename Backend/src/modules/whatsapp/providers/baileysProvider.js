const P = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  jidNormalizedUser
} = require('@whiskeysockets/baileys');

const pathHelper = require('../../utils/pathHelper');
const WhatsAppProvider = require('./whatsAppProvider');

class BaileysProvider extends WhatsAppProvider {
  constructor(id, options = {}) {
    super(id);
    this.socket = null;
    this.options = options;
    this.disconnectReason = null;
  }

  async initialize() {
    const sessionDir = pathHelper.ensureDir(
      pathHelper.resolve('data', 'sessions', `session-${this.id}`)
    );
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      logger: P({ level: 'silent' }),
      browser: ['SmartDispatcher', 'Chrome', '1.0.0'],
      syncFullHistory: false
    });

    this.socket.ev.on('creds.update', saveCreds);
    this.socket.ev.on('connection.update', (update) => {
      if (update.lastDisconnect?.error) {
        const statusCode = update.lastDisconnect.error?.output?.statusCode;
        this.disconnectReason = statusCode;
      }
      if (update.qr) {
        this.emit('qr', update.qr);
      }
      this.emit('connection.update', update);
    });
    this.socket.ev.on('creds.update', () => {
      this.emit('creds.update');
    });

    this.socket.ev.on('messages.update', (updates) => {
      updates.forEach((update) => {
        const messageId = update.key?.id;
        const status = update.update?.status;
        if (!messageId || typeof status === 'undefined') {
          return;
        }
        const mapped = this._mapReceiptStatus(status);
        if (mapped) {
          this.emit('message.status', {
            messageId,
            status: mapped,
            timestamp: Date.now()
          });
        }
      });
    });
  }

  getDisconnectReason() {
    return this.disconnectReason;
  }

  async validateNumber(rawNumber) {
    if (!this.socket) {
      throw new Error('Provider not initialized');
    }
    const normalized = this._normalizeNumber(rawNumber);
    const jid = jidNormalizedUser(`${normalized}@s.whatsapp.net`);
    const result = await this.socket.onWhatsApp(jid);
    const exists = Boolean(result && result[0] && result[0].exists);
    return { jid, exists };
  }

  async sendMessage(jid, message) {
    if (!this.socket) {
      throw new Error('Provider not initialized');
    }
    return this.socket.sendMessage(jid, { text: message });
  }

  getPhoneNumber() {
    const id = this.socket?.user?.id;
    if (!id) return null;
    return id.split('@')[0];
  }

  getDisplayName() {
    return this.socket?.user?.name || this.socket?.user?.verifiedName || null;
  }

  async destroy() {
    if (this.socket?.end) {
      this.socket.end(new Error('Session stopped'));
      return;
    }
    if (this.socket?.logout) {
      await this.socket.logout();
    }
  }

  isLoggedOut() {
    return this.disconnectReason === DisconnectReason.loggedOut;
  }

  _normalizeNumber(rawNumber) {
    const digits = String(rawNumber || '').replace(/\D/g, '');
    if (!digits) {
      throw new Error('Invalid phone number');
    }
    return digits;
  }

  _mapReceiptStatus(status) {
    const mapping = {
      1: 'SENT',
      2: 'DELIVERED',
      3: 'READ',
      4: 'PLAYED'
    };
    return mapping[status] || null;
  }
}

module.exports = BaileysProvider;
