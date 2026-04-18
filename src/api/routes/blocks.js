const { Router } = require('express');
const handlers = require('../container');

const router = Router();

// PATCH /blocks/:id/content
router.patch('/:id/content', async (req, res, next) => {
  try {
    const result = await handlers.updateBlockContent.execute({
      blockId: req.params.id,
      content: req.body.content,
      userId: req.body.userId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /blocks/:id/references
router.post('/:id/references', async (req, res, next) => {
  try {
    const result = await handlers.addReference.execute({
      sourceBlockId: req.params.id,
      targetBlockId: req.body.targetBlockId,
      userId: req.body.userId,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
