const { Router } = require('express');
const { param, body } = require('express-validator');
const handlers = require('../container');
const { handleValidation } = require('../middleware/validate');

const router = Router();

const validateId = [param('id').isUUID().withMessage('id must be a valid UUID'), handleValidation];

// PATCH /blocks/:id/content
router.patch(
  '/:id/content',
  [...validateId, body('content').isString().notEmpty().withMessage('content is required'), handleValidation],
  async (req, res, next) => {
    try {
      const result = await handlers.updateBlockContent.execute({
        blockId: req.params.id,
        content: req.body.content,
        userId: req.user.userId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /blocks/:id/references
router.post(
  '/:id/references',
  [...validateId, body('targetBlockId').isUUID().withMessage('targetBlockId must be a valid UUID'), handleValidation],
  async (req, res, next) => {
    try {
      const result = await handlers.addReference.execute({
        sourceBlockId: req.params.id,
        targetBlockId: req.body.targetBlockId,
        userId: req.user.userId,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
