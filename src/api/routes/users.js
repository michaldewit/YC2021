const { Router } = require('express');
const db = require('../../db/client');
const handlers = require('../container');
const { createDelegation, revokeDelegation } = require('../../delegations/delegationService');

const router = Router();

// POST /users
router.post('/', async (req, res, next) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
    const { rows } = await db.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /users
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// DELETE /users/:id (deactivate)
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await handlers.userDeactivated.execute({
      userId: req.params.id,
      requestedBy: req.body.requestedBy,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /users/:id/delegations
router.post('/:id/delegations', async (req, res, next) => {
  try {
    const delegation = await createDelegation(req.params.id, req.body.delegateId);
    res.status(201).json(delegation);
  } catch (err) {
    next(err);
  }
});

// DELETE /users/:id/delegations/:delegationId
router.delete('/:id/delegations/:delegationId', async (req, res, next) => {
  try {
    await revokeDelegation(req.params.delegationId, req.params.id);
    res.json({ revoked: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
