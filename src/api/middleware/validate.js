const { validationResult } = require('express-validator');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
}

function isUUID(value) {
  return UUID_RE.test(value);
}

function requireUUIDParam(paramName) {
  return (req, res, next) => {
    if (!isUUID(req.params[paramName])) {
      return res.status(400).json({ error: `${paramName} must be a valid UUID` });
    }
    next();
  };
}

module.exports = { handleValidation, isUUID, requireUUIDParam };
