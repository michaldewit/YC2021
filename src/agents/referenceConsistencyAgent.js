/**
 * Agent 1 — Reference Consistency Agent
 * Verifies all references point to existing blocks and that referenced versions exist.
 */
const db = require('../db/client');

async function run() {
  console.log('[Agent:ReferenceConsistency] Starting...');
  const issues = [];

  // References pointing to non-existent target blocks
  const { rows: danglingBlocks } = await db.query(`
    SELECT r.id AS reference_id, r.target_block_id
    FROM references r
    LEFT JOIN blocks b ON r.target_block_id = b.id
    WHERE b.id IS NULL
  `);
  for (const row of danglingBlocks) {
    issues.push({ type: 'MISSING_TARGET_BLOCK', ...row });
  }

  // References pointing to non-existent versions
  const { rows: danglingVersions } = await db.query(`
    SELECT r.id AS reference_id, r.target_version_id
    FROM references r
    LEFT JOIN block_versions bv ON r.target_version_id = bv.id
    WHERE bv.id IS NULL
  `);
  for (const row of danglingVersions) {
    issues.push({ type: 'MISSING_TARGET_VERSION', ...row });
  }

  // Stale is_outdated flag (hash matches current but still flagged outdated)
  const { rows: staleFlags } = await db.query(`
    SELECT r.id AS reference_id, r.target_block_id, r.target_hash, bv.content_hash AS current_hash
    FROM references r
    JOIN (
      SELECT DISTINCT ON (block_id) block_id, content_hash
      FROM block_versions ORDER BY block_id, created_at DESC
    ) bv ON r.target_block_id = bv.block_id
    WHERE r.is_outdated = TRUE AND r.target_hash = bv.content_hash
  `);
  for (const row of staleFlags) {
    issues.push({ type: 'STALE_OUTDATED_FLAG', ...row });
  }

  printReport('ReferenceConsistency', issues);
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
