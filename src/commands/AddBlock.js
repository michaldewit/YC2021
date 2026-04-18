const BaseCommandHandler = require('./BaseCommandHandler');

class AddBlock extends BaseCommandHandler {
  async execute({ documentId, position, content, userId }) {
    if (!documentId || !userId) throw new Error('documentId and userId are required');

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const { rows: docs } = await client.query(
        'SELECT id FROM documents WHERE id = $1',
        [documentId]
      );
      if (!docs.length) throw new Error(`Document ${documentId} not found`);

      const { rows: posRow } = await client.query(
        'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM blocks WHERE document_id = $1',
        [documentId]
      );
      const pos = position !== undefined ? position : posRow[0].next_pos;

      const { rows: block } = await client.query(
        `INSERT INTO blocks (document_id, position) VALUES ($1, $2) RETURNING *`,
        [documentId, pos]
      );

      await client.query('COMMIT');

      await this.emit('BlockAdded', 'block', block[0].id, {
        blockId: block[0].id,
        documentId,
        position: pos,
        addedBy: userId,
      });

      return block[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = AddBlock;
