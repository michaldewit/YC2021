const BaseCommandHandler = require('../commands/BaseCommandHandler');

class SubmitForApproval extends BaseCommandHandler {
  async execute({ documentId, submittedBy }) {
    if (!documentId || !submittedBy) throw new Error('documentId and submittedBy are required');

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const { rows: docs } = await client.query(
        'SELECT id, author_id, status FROM documents WHERE id = $1',
        [documentId]
      );
      if (!docs.length) throw new Error(`Document ${documentId} not found`);
      const doc = docs[0];

      if (!['draft', 'rejected'].includes(doc.status)) {
        throw new Error(`Document is in status '${doc.status}' and cannot be submitted for approval`);
      }

      const { rows: outdatedRefs } = await client.query(
        `SELECT COUNT(*) AS cnt FROM reference_views rv
         JOIN block_views bv ON rv.source_block_id = bv.id
         WHERE bv.document_id = $1 AND rv.is_outdated = TRUE`,
        [documentId]
      );
      if (parseInt(outdatedRefs[0].cnt) > 0) {
        throw new Error('Document has outdated references — resolve them before submitting');
      }

      // Delete any previous pending approvals before creating new ones
      await client.query(
        `DELETE FROM approvals WHERE document_id = $1 AND decision IS NULL`,
        [documentId]
      );

      // Resolve two distinct approvers (not the author) via delegation
      const approvers = await this._resolveApprovers(client, doc.author_id);

      const approvalIds = [];
      for (const approver of approvers) {
        const { rows } = await client.query(
          `INSERT INTO approvals (document_id, approver_id, delegated_from_id)
           VALUES ($1, $2, $3) RETURNING id`,
          [documentId, approver.resolvedId, approver.originalId !== approver.resolvedId ? approver.originalId : null]
        );
        approvalIds.push(rows[0].id);
      }

      await client.query(
        `UPDATE documents SET status = 'pending_approval', updated_at = NOW() WHERE id = $1`,
        [documentId]
      );

      await client.query('COMMIT');

      await this.emit('ApprovalSubmitted', 'document', documentId, {
        documentId,
        submittedBy,
        approvalIds,
        approvers: approvers.map((a) => a.resolvedId),
      });

      return { documentId, approvalIds };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Returns two distinct approvers that are not the author, resolving delegations
  async _resolveApprovers(client, authorId) {
    const { rows: candidates } = await client.query(
      `SELECT id FROM users WHERE is_active = TRUE AND id <> $1 LIMIT 10`,
      [authorId]
    );

    if (candidates.length < 2) throw new Error('Not enough active non-author users to form a 2-approver set');

    const { resolveDelegation } = require('../delegations/delegationService');
    const resolved = [];
    const usedResolvedIds = new Set();

    for (const candidate of candidates) {
      const resolvedId = await resolveDelegation(client, candidate.id);
      if (!usedResolvedIds.has(resolvedId) && resolvedId !== authorId) {
        resolved.push({ originalId: candidate.id, resolvedId });
        usedResolvedIds.add(resolvedId);
        if (resolved.length === 2) break;
      }
    }

    if (resolved.length < 2) throw new Error('Could not resolve two distinct approvers after delegation');
    return resolved;
  }
}

module.exports = SubmitForApproval;
