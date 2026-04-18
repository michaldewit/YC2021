/**
 * Agent 2 — Approval Integrity Agent
 * Verifies 4-eye principle and delegation validity on all approvals.
 */
const db = require('../db/client');

async function run() {
  console.log('[Agent:ApprovalIntegrity] Starting...');
  const issues = [];

  // Documents in pending_approval with fewer than 2 distinct approvers
  const { rows: under2 } = await db.query(`
    SELECT document_id, COUNT(DISTINCT approver_id) AS approver_count
    FROM approvals
    WHERE decision IS NULL
    GROUP BY document_id
    HAVING COUNT(DISTINCT approver_id) < 2
  `);
  for (const row of under2) {
    issues.push({ type: 'FEWER_THAN_2_APPROVERS', documentId: row.document_id, count: row.approver_count });
  }

  // Approvals where approver is the document author (4-eye violation)
  const { rows: selfApprovals } = await db.query(`
    SELECT a.id AS approval_id, a.document_id, a.approver_id
    FROM approvals a
    JOIN documents d ON a.document_id = d.id
    WHERE a.approver_id = d.author_id
  `);
  for (const row of selfApprovals) {
    issues.push({ type: 'SELF_APPROVAL', ...row });
  }

  // Approvals referencing deactivated approvers that are still pending
  const { rows: deactivatedApprovers } = await db.query(`
    SELECT a.id AS approval_id, a.document_id, a.approver_id
    FROM approvals a
    JOIN users u ON a.approver_id = u.id
    WHERE u.is_active = FALSE AND a.decision IS NULL
  `);
  for (const row of deactivatedApprovers) {
    issues.push({ type: 'DEACTIVATED_APPROVER_PENDING', ...row });
  }

  printReport('ApprovalIntegrity', issues);
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
