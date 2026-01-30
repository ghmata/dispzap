const assert = require('assert');
const EventEmitter = require('events');
const WhatsAppClient = require('../src/modules/whatsapp/whatsappClient');

class MockProvider extends EventEmitter {
  async initialize() {}
  async validateNumber(number) {
    return { jid: `${number}@s.whatsapp.net`, exists: true };
  }
  async sendMessage() {
    return { key: { id: 'mock' } };
  }
}

(async () => {
  const client = new WhatsAppClient('chip_invalid', {
    provider: new MockProvider(),
    complianceConfig: {
      maxMessagesPerHour: 10,
      maxMessagesPerDay: 10
    }
  });

  client._transition('AUTHENTICATING', 'test');
  client._transition('CONNECTED', 'test');
  client._transition('READY', 'test');
  client._transition('ERROR', 'forced_error');

  let blocked = false;
  try {
    await client.sendMessage('5511999999999', 'Mensagem inválida');
  } catch (error) {
    blocked = true;
  }

  assert.ok(blocked, 'Expected send to be blocked in ERROR state');
  console.log('Invalid state blocking test passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
