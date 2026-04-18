const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true });

const schemas = {
  DocumentCreated: {
    type: 'object',
    required: ['documentId', 'title', 'authorId'],
    properties: {
      documentId: { type: 'string', format: 'uuid' },
      title: { type: 'string', minLength: 1 },
      authorId: { type: 'string', format: 'uuid' },
    },
    additionalProperties: true,
  },
  BlockAdded: {
    type: 'object',
    required: ['blockId', 'documentId', 'addedBy'],
    properties: {
      blockId: { type: 'string' },
      documentId: { type: 'string' },
      position: { type: 'integer' },
      addedBy: { type: 'string' },
    },
    additionalProperties: true,
  },
  BlockUpdated: {
    type: 'object',
    required: ['blockId', 'documentId', 'versionId', 'contentHash', 'updatedBy'],
    properties: {
      blockId: { type: 'string' },
      documentId: { type: 'string' },
      versionId: { type: 'string' },
      contentHash: { type: 'string' },
      updatedBy: { type: 'string' },
    },
    additionalProperties: true,
  },
  ApprovalSubmitted: {
    type: 'object',
    required: ['documentId', 'submittedBy'],
    properties: {
      documentId: { type: 'string' },
      submittedBy: { type: 'string' },
    },
    additionalProperties: true,
  },
  ApprovalDecided: {
    type: 'object',
    required: ['approvalId', 'documentId', 'approverId', 'decision'],
    properties: {
      approvalId: { type: 'string' },
      documentId: { type: 'string' },
      approverId: { type: 'string' },
      decision: { type: 'string', enum: ['approved', 'rejected'] },
    },
    additionalProperties: true,
  },
  UserDeactivated: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string' },
    },
    additionalProperties: true,
  },
  ReferenceAdded: {
    type: 'object',
    required: ['referenceId', 'sourceBlockId', 'targetBlockId', 'targetVersionId'],
    properties: {
      referenceId: { type: 'string' },
      sourceBlockId: { type: 'string' },
      targetBlockId: { type: 'string' },
      targetVersionId: { type: 'string' },
      targetHash: { type: 'string' },
    },
    additionalProperties: true,
  },
};

const validators = {};
for (const [type, schema] of Object.entries(schemas)) {
  validators[type] = ajv.compile(schema);
}

function validateEvent(eventType, payload) {
  const validate = validators[eventType];
  if (!validate) return { valid: true };
  const valid = validate(payload);
  return { valid, errors: validate.errors };
}

module.exports = { validateEvent, schemas };
