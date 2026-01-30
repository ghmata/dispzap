const SpintaxParser = require('./spintax');

function normalizeVariables(variables = {}) {
  return Object.entries(variables).reduce((acc, [key, value]) => {
    if (!key) return acc;
    acc[String(key).trim().toLowerCase()] = value == null ? '' : String(value);
    return acc;
  }, {});
}

function applyTemplate(template, variables) {
  if (!template) return '';
  const normalized = normalizeVariables(variables);

  const withVariables = template.replace(/\{([^{}|]+)\}/g, (match, rawKey) => {
    const key = String(rawKey).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      return normalized[key];
    }
    return match;
  });

  return SpintaxParser.parse(withVariables);
}

module.exports = {
  applyTemplate
};
