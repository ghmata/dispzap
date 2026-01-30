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
  const client = new WhatsAppClient('chip_cooldown', {
    provider: new MockProvider(),
    complianceConfig: {
      maxMessagesPerHour: 10,
      maxMessagesPerDay: 10
    }
  });

  client._transition('AUTHENTICATING', 'test');
  client._transition('CONNECTED', 'test');
  client._transition('READY', 'test');

  await client.enterCooldown(10, 'test_cooldown');
  assert.strictEqual(client.status, 'READY', 'Expected client to return to READY after cooldown');

  console.log('Cooldown test passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
