const { Router } = require('express');
const { param, body } = require('express-validator');
const handlers = require('../container');
const db = require('../../db/client');
const { handleValidation } = require('../middleware/validate');

const router = Router();

const validateId = [param('id').isUUID().withMessage('id must be a valid UUID'), handleValidation];

// POST /approvals/:id/decide
router.post(
  '/:id/decide',
  [
    ...validateId,
    body('decision').isIn(['approved', 'rejected']).withMessage("decision must be 'approved' or 'rejected'"),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const result = await handlers.decideApproval.execute({
        approvalId: req.params.id,
        approverId: req.user.userId,  // identity comes from JWT, not request body
        decision: req.body.decision,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /approvals/:id
router.get('/:id', validateId, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM approvals WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Approval not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
