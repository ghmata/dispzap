const { sanitizePhone, isValidPhone } = require('../src/modules/utils/phone');

function runPhoneTests() {
  console.log('--- PHONE NORMALIZATION TEST ---');

  const samples = [
    { input: '(11) 99999-8888', expected: '5511999998888', valid: true },
    { input: '5511987654321', expected: '5511987654321', valid: true },
    { input: '11999998888', expected: '5511999998888', valid: true },
    { input: '', expected: '', valid: false }
  ];

  samples.forEach((sample) => {
    const clean = sanitizePhone(sample.input);
    if (clean !== sample.expected) {
      console.error(`FAIL: Expected ${sample.expected}, got ${clean}`);
      process.exit(1);
    }
    if (isValidPhone(sample.input) !== sample.valid) {
      console.error(`FAIL: Expected validity ${sample.valid} for ${sample.input}`);
      process.exit(1);
    }
  });

  console.log('✅ Phone normalization ok.');
}

runPhoneTests();
