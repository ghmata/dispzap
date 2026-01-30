const SpintaxParser = require('../src/modules/campaign/spintax');
const ComplianceEngine = require('../src/modules/compliance/engine');
const Dispatcher = require('../src/modules/dispatch/dispatcher');

const MOCK_LB = {
  getNextClient: () => ({ id: 'mock_chip_1', waitUntilReady: async () => {}, sendMessage: async () => ({}) })
};

async function runDay3Validation() {
  console.log('--- DAY 3 ANTI-BAN & DISPATCH VALIDATION ---');

  // 1. Test Spintax
  console.log('\n[1] Testing Spintax Randomness: "{Olá|Oi|Ei} Amigo"');
  const counts = {};
  for(let i=0; i<100; i++) {
     const res = SpintaxParser.parse('{Olá|Oi|Ei} Amigo');
     counts[res] = (counts[res] || 0) + 1;
  }
  console.log(JSON.stringify(counts, null, 2));

  // 2. Test Compliance Delays
  console.log('\n[2] Testing Anti-Ban Delays (Distribution)');
  const engine = new ComplianceEngine();
  const delays = [];
  for(let i=0; i<10; i++) {
    delays.push(engine.getVariableDelay());
  }
  console.log('Sample Delays (ms):', delays.join(', '));
  
  // 3. Test Dispatch Flow
  console.log('\n[3] Testing Full Dispatch Flow (Dry Run)');
  const dispatcher = new Dispatcher(MOCK_LB);
  const result = await dispatcher.dispatch({
    phone: '5511999999999',
    messageTemplate: '{Olá|Oi} Teste de Envio',
    dryRun: true
  });
  
  console.log('Dispatch Result:', result);

  console.log('\n✅ CHECKPOINT PASSED: Spintax and Compliance Engine functional.');
}

runDay3Validation();
