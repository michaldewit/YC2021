const BaseCommandHandler = require('./BaseCommandHandler');

class UserDeactivated extends BaseCommandHandler {
  async execute({ userId, requestedBy }) {
    if (!userId) throw new Error('userId is required');

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const { rows: users } = await client.query(
        'SELECT id, is_active FROM users WHERE id = $1',
        [userId]
      );
      if (!users.length) throw new Error(`User ${userId} not found`);
      if (!users[0].is_active) throw new Error(`User ${userId} is already deactivated`);

      await client.query(
        `UPDATE users SET is_active = FALSE, deactivated_at = NOW() WHERE id = $1`,
        [userId]
      );

      // Revoke all active delegations from this user
      await client.query(
        `UPDATE delegations SET is_active = FALSE, revoked_at = NOW()
         WHERE delegator_id = $1 AND is_active = TRUE`,
        [userId]
      );

      // Revoke delegations TO this user
      await client.query(
        `UPDATE delegations SET is_active = FALSE, revoked_at = NOW()
         WHERE delegate_id = $1 AND is_active = TRUE`,
        [userId]
      );

      // Impact report
      const impactReport = await this._buildImpactReport(client, userId);

      await client.query('COMMIT');

      await this.emit('UserDeactivated', 'user', userId, {
        userId,
        requestedBy,
        impactReport,
      });

      return { userId, impactReport };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async _buildImpactReport(client, userId) {
    const [pendingApprovals, openDelegations, authoredDocs] = await Promise.all([
      client.query(
        `SELECT a.id, a.document_id, d.title FROM approvals a
         JOIN documents d ON a.document_id = d.id
         WHERE a.approver_id = $1 AND a.decision IS NULL`,
        [userId]
      ),
      client.query(
        `SELECT id, delegate_id FROM delegations WHERE delegator_id = $1 AND is_active = TRUE`,
        [userId]
      ),
      client.query(
        `SELECT id, title, status FROM documents WHERE author_id = $1 AND status = 'pending_approval'`,
        [userId]
      ),
    ]);

    return {
      pendingApprovalsCount: pendingApprovals.rows.length,
      pendingApprovals: pendingApprovals.rows,
      activeDelegationsRevoked: openDelegations.rows.length,
      documentsInApproval: authoredDocs.rows.length,
      documentsInApprovalList: authoredDocs.rows,
    };
  }
}

module.exports = UserDeactivated;
