const { applyTemplate } = require('../src/modules/campaign/templateEngine');

function runTemplateTests() {
  console.log('--- TEMPLATE ENGINE TEST ---');

  const template = '{Olá|Oi} {nome}, seu código é {codigo}.';
  const variables = { nome: 'Ana', codigo: 'ABC123' };
  const rendered = applyTemplate(template, variables);

  if (!rendered.includes('Ana') || !rendered.includes('ABC123')) {
    console.error('FAIL: Variables were not replaced correctly.');
    process.exit(1);
  }

  const greeting = rendered.split(' ')[0];
  if (!['Olá', 'Oi'].includes(greeting)) {
    console.error(`FAIL: Spintax not applied correctly. Got "${greeting}".`);
    process.exit(1);
  }

  console.log('✅ Template engine ok.');
}

runTemplateTests();
