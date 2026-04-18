const BaseCommandHandler = require('../commands/BaseCommandHandler');

class AddReference extends BaseCommandHandler {
  async execute({ sourceBlockId, targetBlockId, userId }) {
    if (!sourceBlockId || !targetBlockId || !userId) {
      throw new Error('sourceBlockId, targetBlockId, and userId are required');
    }
    if (sourceBlockId === targetBlockId) {
      throw new Error('A block cannot reference itself');
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const { rows: latestVersion } = await client.query(
        `SELECT id, content_hash FROM block_versions
         WHERE block_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [targetBlockId]
      );
      if (!latestVersion.length) {
        throw new Error(`Target block ${targetBlockId} has no versions`);
      }
      const { id: targetVersionId, content_hash: targetHash } = latestVersion[0];

      const { rows } = await client.query(
        `INSERT INTO references (source_block_id, target_block_id, target_version_id, target_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (source_block_id, target_block_id)
         DO UPDATE SET target_version_id = $3, target_hash = $4, is_outdated = FALSE, updated_at = NOW()
         RETURNING *`,
        [sourceBlockId, targetBlockId, targetVersionId, targetHash]
      );

      await client.query('COMMIT');

      await this.emit('ReferenceAdded', 'reference', rows[0].id, {
        referenceId: rows[0].id,
        sourceBlockId,
        targetBlockId,
        targetVersionId,
        targetHash,
        addedBy: userId,
      });

      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = AddReference;
