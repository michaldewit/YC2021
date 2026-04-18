const db = require('../db/client');

async function getOutdatedReferences(documentId) {
  const { rows } = await db.query(
    `SELECT rv.*, bv_src.document_id AS source_document_id
     FROM reference_views rv
     JOIN block_views bv_src ON rv.source_block_id = bv_src.id
     WHERE bv_src.document_id = $1 AND rv.is_outdated = TRUE`,
    [documentId]
  );
  return rows;
}

async function getAllReferencesForDocument(documentId) {
  const { rows } = await db.query(
    `SELECT rv.*,
            bv_src.document_id AS source_document_id,
            bv_tgt.current_content AS target_current_content,
            bv_tgt.current_hash AS target_current_hash
     FROM reference_views rv
     JOIN block_views bv_src ON rv.source_block_id = bv_src.id
     JOIN block_views bv_tgt ON rv.target_block_id = bv_tgt.id
     WHERE bv_src.document_id = $1`,
    [documentId]
  );
  return rows;
}

module.exports = { getOutdatedReferences, getAllReferencesForDocument };
