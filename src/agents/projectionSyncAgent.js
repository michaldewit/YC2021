/**
 * Agent 3 — Projection Sync Agent
 * Compares write model vs read model for consistency.
 */
const db = require('../db/client');

async function run() {
  console.log('[Agent:ProjectionSync] Starting...');
  const issues = [];

  // Documents in write model missing from read model
  const { rows: missingDocs } = await db.query(`
    SELECT d.id FROM documents d
    LEFT JOIN document_views dv ON d.id = dv.id
    WHERE dv.id IS NULL
  `);
  for (const row of missingDocs) {
    issues.push({ type: 'DOCUMENT_MISSING_FROM_VIEW', documentId: row.id });
  }

  // Block count mismatch
  const { rows: countMismatch } = await db.query(`
    SELECT d.id AS document_id, COUNT(b.id) AS actual_count, dv.block_count AS view_count
    FROM documents d
    LEFT JOIN blocks b ON b.document_id = d.id
    JOIN document_views dv ON dv.id = d.id
    GROUP BY d.id, dv.block_count
    HAVING COUNT(b.id) <> dv.block_count
  `);
  for (const row of countMismatch) {
    issues.push({ type: 'BLOCK_COUNT_MISMATCH', ...row });
  }

  // Blocks in write model missing from block_views
  const { rows: missingBlocks } = await db.query(`
    SELECT b.id FROM blocks b
    LEFT JOIN block_views bv ON b.id = bv.id
    WHERE bv.id IS NULL
  `);
  for (const row of missingBlocks) {
    issues.push({ type: 'BLOCK_MISSING_FROM_VIEW', blockId: row.id });
  }

  // Hash mismatch between write and read model
  const { rows: hashMismatch } = await db.query(`
    SELECT bv.id AS block_id, bv.current_hash AS view_hash, latest.content_hash AS write_hash
    FROM block_views bv
    JOIN (
      SELECT DISTINCT ON (block_id) block_id, content_hash
      FROM block_versions ORDER BY block_id, created_at DESC
    ) latest ON bv.id = latest.block_id
    WHERE bv.current_hash IS DISTINCT FROM latest.content_hash
  `);
  for (const row of hashMismatch) {
    issues.push({ type: 'HASH_MISMATCH_WRITE_VS_READ', ...row });
  }

  printReport('ProjectionSync', issues);
  return issues;
}

function printReport(name, issues) {
  if (!issues.length) {
    console.log(`[Agent:${name}] ✓ No issues found`);
  } else {
    console.error(`[Agent:${name}] ✗ ${issues.length} issue(s) found:`);
    issues.forEach((i) => console.error('  -', JSON.stringify(i)));
  }
}

if (require.main === module) {
  run().then(() => db.end()).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { run };
