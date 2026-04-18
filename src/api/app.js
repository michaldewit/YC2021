const express = require('express');
const documentsRouter = require('./routes/documents');
const blocksRouter = require('./routes/blocks');
const approvalsRouter = require('./routes/approvals');
const usersRouter = require('./routes/users');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/documents', documentsRouter);
app.use('/blocks', blocksRouter);
app.use('/approvals', approvalsRouter);
app.use('/users', usersRouter);

app.use(errorHandler);

module.exports = app;
