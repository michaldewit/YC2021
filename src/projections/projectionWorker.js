const db = require('../db/client');
const eventBus = require('../events/eventBus');

async function handleDocumentCreated(payload) {
  const { documentId, title, authorId } = payload;
  const { rows: users } = await db.query('SELECT name FROM users WHERE id = $1', [authorId]);
  const authorName = users[0]?.name || 'Unknown';

  await db.query(
    `INSERT INTO document_views (id, title, author_id, author_name, status, block_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'draft', 0, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [documentId, title, authorId, authorName]
  );
}

async function handleBlockAdded(payload) {
  const { blockId, documentId, position, addedBy } = payload;

  await db.query(
    `INSERT INTO block_views (id, document_id, position, version_count)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (id) DO NOTHING`,
    [blockId, documentId, position]
  );

  await db.query(
    `UPDATE document_views SET block_count = block_count + 1, updated_at = NOW() WHERE id = $1`,
    [documentId]
  );
}

async function handleBlockUpdated(payload) {
  const { blockId, documentId, versionId, contentHash, updatedBy } = payload;

  const { rows } = await db.query(
    'SELECT content FROM block_versions WHERE id = $1',
    [versionId]
  );
  const content = rows[0]?.content;

  await db.query(
    `UPDATE block_views
     SET current_content = $2, current_hash = $3, version_count = version_count + 1,
         last_updated_by = $4, last_updated_at = NOW()
     WHERE id = $1`,
    [blockId, content, contentHash, updatedBy]
  );

  // flag any references to this block as outdated when hash changed
  await db.query(
    `UPDATE references SET is_outdated = TRUE, updated_at = NOW()
     WHERE target_block_id = $1 AND target_hash <> $2`,
    [blockId, contentHash]
  );

  // sync reference_views
  await db.query(
    `UPDATE reference_views SET is_outdated = TRUE, updated_at = NOW()
     WHERE target_block_id = $1 AND target_hash <> $2`,
    [blockId, contentHash]
  );

  // flag document if it has outdated refs
  const { rows: outdated } = await db.query(
    `SELECT COUNT(*) AS cnt FROM reference_views rv
     JOIN block_views bv ON rv.source_block_id = bv.id
     WHERE bv.document_id = $1 AND rv.is_outdated = TRUE`,
    [documentId]
  );
  await db.query(
    `UPDATE document_views SET has_outdated_refs = $2, updated_at = NOW() WHERE id = $1`,
    [documentId, parseInt(outdated[0].cnt) > 0]
  );
}

async function handleReferenceAdded(payload) {
  const { referenceId, sourceBlockId, targetBlockId, targetVersionId, targetHash } = payload;
  await db.query(
    `INSERT INTO reference_views (id, source_block_id, target_block_id, target_version_id, target_hash, is_outdated, updated_at)
     VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [referenceId, sourceBlockId, targetBlockId, targetVersionId, targetHash]
  );
}

async function handleApprovalDecided(payload) {
  const { documentId, decision } = payload;
  const { rows: approvals } = await db.query(
    `SELECT decision FROM approvals WHERE document_id = $1 AND decision IS NOT NULL`,
    [documentId]
  );

  const approved = approvals.filter((a) => a.decision === 'approved').length;
  const rejected = approvals.filter((a) => a.decision === 'rejected').length;

  let newStatus;
  if (rejected > 0) newStatus = 'rejected';
  else if (approved >= 2) newStatus = 'approved';

  if (newStatus) {
    await db.query(
      `UPDATE document_views SET status = $2, updated_at = NOW() WHERE id = $1`,
      [documentId, newStatus]
    );
    await db.query(
      `UPDATE documents SET status = $2, updated_at = NOW() WHERE id = $1`,
      [documentId, newStatus]
    );
  }
}

async function startProjectionWorker() {
  await eventBus.subscribe('DocumentCreated', handleDocumentCreated, 'proj_document_created');
  await eventBus.subscribe('BlockAdded', handleBlockAdded, 'proj_block_added');
  await eventBus.subscribe('BlockUpdated', handleBlockUpdated, 'proj_block_updated');
  await eventBus.subscribe('ReferenceAdded', handleReferenceAdded, 'proj_reference_added');
  await eventBus.subscribe('ApprovalDecided', handleApprovalDecided, 'proj_approval_decided');
  console.log('Projection worker started');
}

module.exports = { startProjectionWorker };
