function errorHandler(err, req, res, next) {
  // Never leak stack traces or internal DB details to clients
  const isDev = process.env.NODE_ENV === 'development';
  const status = err.status || (err.message?.includes('not found') ? 404 : 400);

  const safeMessage = isDev ? err.message : sanitizeMessage(err.message);

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[${req.method} ${req.path}] ${status}: ${err.message}`);
  }

  res.status(status).json({ error: safeMessage });
}

// Strip internal details that shouldn't reach clients in production
function sanitizeMessage(msg) {
  if (!msg) return 'An error occurred';
  // Redact SQL error details
  if (msg.match(/syntax error|relation|column|operator/i)) return 'An error occurred';
  return msg;
}

module.exports = errorHandler;
