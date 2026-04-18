const db = require('../db/client');

const MAX_DEPTH = 10;

/**
 * Resolves the effective approver for a given userId by following active delegations.
 * Detects A→B→A cycles (collapse) and throws if found.
 * Accepts an optional existing client to participate in a transaction.
 */
async function resolveDelegation(clientOrNull, userId) {
  const client = clientOrNull || db;
  const visited = new Set();
  let current = userId;

  while (visited.size < MAX_DEPTH) {
    if (visited.has(current)) {
      throw new Error(`Delegation cycle detected involving user ${current}`);
    }
    visited.add(current);

    const { rows } = await client.query(
      `SELECT delegate_id FROM delegations
       WHERE delegator_id = $1 AND is_active = TRUE LIMIT 1`,
      [current]
    );

    if (!rows.length) return current;
    current = rows[0].delegate_id;
  }

  throw new Error(`Delegation chain too long for user ${userId} (max depth ${MAX_DEPTH})`);
}

async function createDelegation(delegatorId, delegateId) {
  if (delegatorId === delegateId) {
    throw new Error('Cannot delegate to yourself');
  }

  // Detect collapse: if delegateId already delegates back to delegatorId
  const effectiveDelegate = await resolveDelegation(null, delegateId);
  if (effectiveDelegate === delegatorId) {
    throw new Error(
      `Delegation collapse: ${delegateId} already resolves to ${delegatorId} — creating this delegation would create a cycle`
    );
  }

  const { rows } = await db.query(
    `INSERT INTO delegations (delegator_id, delegate_id)
     VALUES ($1, $2) RETURNING *`,
    [delegatorId, delegateId]
  );
  return rows[0];
}

async function revokeDelegation(delegationId, requestingUserId) {
  const { rows } = await db.query(
    'SELECT * FROM delegations WHERE id = $1',
    [delegationId]
  );
  if (!rows.length) throw new Error(`Delegation ${delegationId} not found`);
  if (rows[0].delegator_id !== requestingUserId) {
    throw new Error('Only the delegator can revoke a delegation');
  }

  await db.query(
    `UPDATE delegations SET is_active = FALSE, revoked_at = NOW() WHERE id = $1`,
    [delegationId]
  );
}

module.exports = { resolveDelegation, createDelegation, revokeDelegation };
