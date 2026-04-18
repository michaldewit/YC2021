const { Router } = require('express');
const { param } = require('express-validator');
const db = require('../../db/client');
const handlers = require('../container');
const { createDelegation, revokeDelegation } = require('../../delegations/delegationService');
const { handleValidation } = require('../middleware/validate');

const router = Router();

const validateId = [param('id').isUUID().withMessage('id must be a valid UUID'), handleValidation];

// GET /users — list all active users (useful for selecting approvers)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, email, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /users/me — current authenticated user's profile
router.get('/me', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, email, is_active, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /users/:id — deactivate a user; only the user themselves or an admin can do this
router.delete('/:id', validateId, async (req, res, next) => {
  try {
    // For now: only allow self-deactivation (admin scope can be added later)
    if (req.params.id !== req.user.userId) {
      return res.status(403).json({ error: 'You can only deactivate your own account' });
    }
    const result = await handlers.userDeactivated.execute({
      userId: req.params.id,
      requestedBy: req.user.userId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /users/:id/delegations — delegate from :id to body.delegateId
router.post('/:id/delegations', validateId, async (req, res, next) => {
  try {
    // Only the authenticated user can create delegations on their own behalf
    if (req.params.id !== req.user.userId) {
      return res.status(403).json({ error: 'You can only create delegations for yourself' });
    }
    const delegation = await createDelegation(req.params.id, req.body.delegateId);
    res.status(201).json(delegation);
  } catch (err) {
    next(err);
  }
});

// DELETE /users/:id/delegations/:delegationId — revoke a delegation
router.delete(
  '/:id/delegations/:delegationId',
  [
    ...validateId,
    param('delegationId').isUUID().withMessage('delegationId must be a valid UUID'),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      if (req.params.id !== req.user.userId) {
        return res.status(403).json({ error: 'You can only revoke your own delegations' });
      }
      await revokeDelegation(req.params.delegationId, req.params.id);
      res.json({ revoked: true });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
