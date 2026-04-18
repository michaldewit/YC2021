const { Router } = require('express');
const handlers = require('../container');
const db = require('../../db/client');

const router = Router();

// POST /approvals/:id/decide
router.post('/:id/decide', async (req, res, next) => {
  try {
    const result = await handlers.decideApproval.execute({
      approvalId: req.params.id,
      approverId: req.body.approverId,
      decision: req.body.decision,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /approvals/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM approvals WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Approval not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
