const { Router } = require('express');
const { param } = require('express-validator');
const db = require('../../db/client');
const handlers = require('../container');
const { getOutdatedReferences, getAllReferencesForDocument } = require('../../references/referenceQueries');
const { handleValidation, requireUUIDParam } = require('../middleware/validate');

const router = Router();

const validateId = [param('id').isUUID().withMessage('id must be a valid UUID'), handleValidation];

// POST /documents
router.post('/', async (req, res, next) => {
  try {
    const result = await handlers.createDocument.execute({
      title: req.body.title,
      authorId: req.user.userId,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /documents
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM document_views ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /documents/:id
router.get('/:id', validateId, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM document_views WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /documents/:id/blocks
router.get('/:id/blocks', validateId, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM block_views WHERE document_id = $1 ORDER BY position',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /documents/:id/references
router.get('/:id/references', validateId, async (req, res, next) => {
  try {
    const refs = await getAllReferencesForDocument(req.params.id);
    res.json(refs);
  } catch (err) {
    next(err);
  }
});

// GET /documents/:id/outdated-references
router.get('/:id/outdated-references', validateId, async (req, res, next) => {
  try {
    const refs = await getOutdatedReferences(req.params.id);
    res.json(refs);
  } catch (err) {
    next(err);
  }
});

// POST /documents/:id/blocks
router.post('/:id/blocks', validateId, async (req, res, next) => {
  try {
    const result = await handlers.addBlock.execute({
      documentId: req.params.id,
      position: req.body.position,
      userId: req.user.userId,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /documents/:id/submit-for-approval
router.post('/:id/submit-for-approval', validateId, async (req, res, next) => {
  try {
    const result = await handlers.submitForApproval.execute({
      documentId: req.params.id,
      submittedBy: req.user.userId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
