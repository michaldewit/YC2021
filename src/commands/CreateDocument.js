const BaseCommandHandler = require('./BaseCommandHandler');

class CreateDocument extends BaseCommandHandler {
  async execute({ title, authorId }) {
    if (!title || !authorId) throw new Error('title and authorId are required');

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO documents (title, author_id) VALUES ($1, $2) RETURNING *`,
        [title, authorId]
      );
      const doc = rows[0];

      await client.query('COMMIT');

      await this.emit('DocumentCreated', 'document', doc.id, {
        documentId: doc.id,
        title: doc.title,
        authorId,
      });

      return doc;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = CreateDocument;
