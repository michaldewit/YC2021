/**
 * Agent 5 — Orphan Detection Agent
 * Detects unused blocks and broken/dangling references.
 */
const db = require('../db/client');

async function run() {
  console.log('[Agent:OrphanDetection] Starting...');
  const issues = [];

  // Blocks with no versions (never had content set)
  const { rows: emptyBlocks } = await db.query(`
    SELECT b.id AS block_id, b.document_id, b.created_at
    FROM blocks b
    LEFT JOIN block_versions bv ON b.id = bv.block_id
    WHERE bv.id IS NULL
  `);
  for (const row of emptyBlocks) {
    issues.push({ type: 'BLOCK_WITHOUT_CONTENT', ...row });
  }

  // Blocks whose document no longer exists (orphaned by cascade miss)
  const { rows: orphanedBlocks } = await db.query(`
    SELECT b.id AS block_id, b.document_id
    FROM blocks b
    LEFT JOIN documents d ON b.document_id = d.id
    WHERE d.id IS NULL
  `);
  for (const row of orphanedBlocks) {
    issues.push({ type: 'BLOCK_ORPHANED_NO_DOCUMENT', ...row });
  }

  // References where source block's document is deleted
  const { rows: orphanedRefs } = await db.query(`
    SELECT r.id AS reference_id, r.source_block_id, b.document_id
    FROM references r
    JOIN blocks b ON r.source_block_id = b.id
    LEFT JOIN documents d ON b.document_id = d.id
    WHERE d.id IS NULL
  `);
  for (const row of orphanedRefs) {
    issues.push({ type: 'REFERENCE_ORPHANED_NO_DOCUMENT', ...row });
  }

  // Reference view rows with no corresponding write model row
  const { rows: ghostViews } = await db.query(`
    SELECT rv.id AS reference_view_id
    FROM reference_views rv
    LEFT JOIN references r ON rv.id = r.id
    WHERE r.id IS NULL
  `);
  for (const row of ghostViews) {
    issues.push({ type: 'GHOST_REFERENCE_VIEW', ...row });
  }

  printReport('OrphanDetection', issues);
  return issues;
}

function printReport(name, issues) {
  if (!issues.length) {
    console.log(`[Agent:${name}] ✓ No issues found`);
  } else {
    console.warn(`[Agent:${name}] ⚠ ${issues.length} issue(s) found:`);
    issues.forEach((i) => console.warn('  -', JSON.stringify(i)));
  }
}

if (require.main === module) {
  run().then(() => db.end()).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { run };
