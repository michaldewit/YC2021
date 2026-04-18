const BaseCommandHandler = require('../commands/BaseCommandHandler');

class DecideApproval extends BaseCommandHandler {
  async execute({ approvalId, approverId, decision }) {
    if (!approvalId || !approverId || !decision) {
      throw new Error('approvalId, approverId, and decision are required');
    }
    if (!['approved', 'rejected'].includes(decision)) {
      throw new Error("decision must be 'approved' or 'rejected'");
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        'SELECT * FROM approvals WHERE id = $1',
        [approvalId]
      );
      if (!rows.length) throw new Error(`Approval ${approvalId} not found`);
      const approval = rows[0];

      if (approval.approver_id !== approverId) {
        throw new Error('Only the assigned approver can decide this approval');
      }
      if (approval.decision !== null) {
        throw new Error('This approval has already been decided');
      }

      await client.query(
        `UPDATE approvals SET decision = $2, decided_at = NOW() WHERE id = $1`,
        [approvalId, decision]
      );

      // Check 4-eye principle: if both decisions are now 'approved' → document approved
      const { rows: allApprovals } = await client.query(
        `SELECT approver_id, decision FROM approvals WHERE document_id = $1`,
        [approval.document_id]
      );
      const uniqueApprovers = new Set(allApprovals.map((a) => a.approver_id));
      if (uniqueApprovers.size < 2) {
        throw new Error('4-eye principle violation: fewer than 2 unique approvers');
      }

      await client.query('COMMIT');

      await this.emit('ApprovalDecided', 'approval', approvalId, {
        approvalId,
        documentId: approval.document_id,
        approverId,
        decision,
      });

      return { approvalId, decision };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = DecideApproval;
