const DEFAULT_COUNTRY_CODE = '55';

function sanitizePhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return '';

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    return `${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  return digits;
}

function isValidPhone(input) {
  const clean = sanitizePhone(input);
  return /^55\d{10,11}$/.test(clean);
}

module.exports = {
  sanitizePhone,
  isValidPhone,
  DEFAULT_COUNTRY_CODE
};
