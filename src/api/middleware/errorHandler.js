function errorHandler(err, req, res, next) {
  const status = err.status || 400;
  const message = err.message || 'Internal server error';

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[${req.method} ${req.path}] ${status}: ${message}`);
  }

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
