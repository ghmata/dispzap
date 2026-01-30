const { randomUUID } = require('crypto');

function createCampaignId() {
  return `cmp_${randomUUID()}`;
}

function createMessageId() {
  return `msg_${randomUUID()}`;
}

function createContactId(row) {
  return `row_${row}`;
}

function buildCorrelationId({ campaignId, contactId, messageId }) {
  return [campaignId, contactId, messageId].filter(Boolean).join(':');
}

function formatCorrelationTag(correlationId) {
  if (!correlationId) return '';
  return `[corr=${correlationId}]`;
}

module.exports = {
  createCampaignId,
  createMessageId,
  createContactId,
  buildCorrelationId,
  formatCorrelationTag
};
