const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRouter = require('./routes/auth');
const documentsRouter = require('./routes/documents');
const blocksRouter = require('./routes/blocks');
const approvalsRouter = require('./routes/approvals');
const usersRouter = require('./routes/users');
const { requireAuth } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// Strict rate limit on auth endpoints to prevent brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authLimiter, authRouter);

// All routes below require a valid JWT
app.use(apiLimiter);
app.use(requireAuth);

app.use('/documents', documentsRouter);
app.use('/blocks', blocksRouter);
app.use('/approvals', approvalsRouter);
app.use('/users', usersRouter);

app.use(errorHandler);

module.exports = app;
