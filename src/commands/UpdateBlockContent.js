const md5 = require('md5');
const BaseCommandHandler = require('./BaseCommandHandler');

class UpdateBlockContent extends BaseCommandHandler {
  async execute({ blockId, content, userId }) {
    if (!blockId || content === undefined || !userId) {
      throw new Error('blockId, content, and userId are required');
    }

    const normalizedContent = content.trim();
    const contentHash = md5(normalizedContent);

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const { rows: blocks } = await client.query(
        'SELECT id, document_id FROM blocks WHERE id = $1',
        [blockId]
      );
      if (!blocks.length) throw new Error(`Block ${blockId} not found`);

      const { rows: existing } = await client.query(
        `SELECT content_hash FROM block_versions
         WHERE block_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [blockId]
      );
      if (existing.length && existing[0].content_hash === contentHash) {
        await client.query('ROLLBACK');
        return { unchanged: true, contentHash };
      }

      const { rows: version } = await client.query(
        `INSERT INTO block_versions (block_id, content, content_hash, created_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [blockId, normalizedContent, contentHash, userId]
      );

      await client.query(
        `UPDATE documents SET updated_at = NOW(), status = 'draft'
         WHERE id = $1 AND status = 'approved'`,
        [blocks[0].document_id]
      );

      await client.query('COMMIT');

      await this.emit('BlockUpdated', 'block', blockId, {
        blockId,
        documentId: blocks[0].document_id,
        versionId: version[0].id,
        contentHash,
        updatedBy: userId,
      });

      return { versionId: version[0].id, contentHash };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = UpdateBlockContent;
