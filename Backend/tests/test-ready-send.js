const assert = require('assert');
const EventEmitter = require('events');
const WhatsAppClient = require('../src/modules/whatsapp/whatsappClient');

(async () => {
  let sendCalled = false;

  class MockProvider extends EventEmitter {
    async initialize() {}
    async validateNumber(number) {
      return { jid: `${number}@s.whatsapp.net`, exists: true };
    }
    async sendMessage() {
      sendCalled = true;
      return { key: { id: 'mock' } };
    }
    getPhoneNumber() {
      return '5511999999999';
    }
    getDisplayName() {
      return 'Mock';
    }
  }

  const client = new WhatsAppClient('chip_mock', {
    provider: new MockProvider(),
    complianceConfig: {
      maxMessagesPerHour: 10,
      maxMessagesPerDay: 10
    }
  });

  client._transition('AUTHENTICATING', 'test');
  client._transition('CONNECTED', 'test');
  client._transition('READY', 'test');

  await client.sendMessage('5511999999999', 'Teste de envio');

  assert.ok(sendCalled, 'Expected sendMessage to be called');

  console.log('READY -> SEND test passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
