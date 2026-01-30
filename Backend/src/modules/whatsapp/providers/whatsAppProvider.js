const EventEmitter = require('events');

class WhatsAppProvider extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
  }

  async initialize() {
    throw new Error('initialize() not implemented');
  }

  async validateNumber() {
    throw new Error('validateNumber() not implemented');
  }

  async sendMessage() {
    throw new Error('sendMessage() not implemented');
  }

  getPhoneNumber() {
    return null;
  }

  getDisplayName() {
    return null;
  }

  async destroy() {
    return undefined;
  }
}

module.exports = WhatsAppProvider;
