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
  const client = new WhatsAppClient('chip_rate', {
    provider: new MockProvider(),
    complianceConfig: {
      maxMessagesPerHour: 1,
      maxMessagesPerDay: 2
    }
  });

  client._transition('AUTHENTICATING', 'test');
  client._transition('CONNECTED', 'test');
  client._transition('READY', 'test');

  await client.sendMessage('5511999999999', 'Primeira mensagem');

  let blocked = false;
  try {
    await client.sendMessage('5511999999999', 'Segunda mensagem');
  } catch (error) {
    blocked = true;
  }

  assert.ok(blocked, 'Expected rate limit to block the second message');
  assert.strictEqual(client.status, 'COOLDOWN', 'Expected client to enter COOLDOWN');

  console.log('Rate limit test passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
