/**
 * Agent 4 — Event Replay Agent
 * Drops all read model rows and replays the event store to rebuild them.
 * Validates CQRS correctness by confirming the result matches the write model.
 */
const db = require('../db/client');

async function run() {
  console.log('[Agent:EventReplay] Starting replay...');

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Drop all read model data
    await client.query('DELETE FROM reference_views');
    await client.query('DELETE FROM block_views');
    await client.query('DELETE FROM document_views');
    console.log('[Agent:EventReplay] Read model cleared');

    // Fetch all events in order
    const { rows: events } = await client.query(
      'SELECT * FROM events ORDER BY sequence_nr ASC'
    );
    console.log(`[Agent:EventReplay] Replaying ${events.length} events...`);

    for (const event of events) {
      await replayEvent(client, event);
    }

    await client.query('COMMIT');
    console.log('[Agent:EventReplay] Replay complete');

    // Run projection sync check
    const { run: checkSync } = require('./projectionSyncAgent');
    const issues = await checkSync();
    if (issues.length) {
      console.error(`[Agent:EventReplay] ✗ Projection sync issues after replay: ${issues.length}`);
      return { success: false, issues };
    }
    console.log('[Agent:EventReplay] ✓ Projection sync clean after replay');
    return { success: true, eventsReplayed: events.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function replayEvent(client, event) {
  const p = event.payload;
  switch (event.event_type) {
    case 'DocumentCreated': {
      const { rows: users } = await client.query('SELECT name FROM users WHERE id = $1', [p.authorId]);
      const authorName = users[0]?.name || 'Unknown';
      await client.query(
        `INSERT INTO document_views (id, title, author_id, author_name, status, block_count, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'draft', 0, $5, $5) ON CONFLICT (id) DO NOTHING`,
        [p.documentId, p.title, p.authorId, authorName, event.occurred_at]
      );
      break;
    }
    case 'BlockAdded':
      await client.query(
        `INSERT INTO block_views (id, document_id, position, version_count)
         VALUES ($1, $2, $3, 0) ON CONFLICT (id) DO NOTHING`,
        [p.blockId, p.documentId, p.position]
      );
      await client.query(
        `UPDATE document_views SET block_count = block_count + 1, updated_at = $2 WHERE id = $1`,
        [p.documentId, event.occurred_at]
      );
      break;
    case 'BlockUpdated': {
      const { rows } = await client.query('SELECT content FROM block_versions WHERE id = $1', [p.versionId]);
      await client.query(
        `UPDATE block_views
         SET current_content = $2, current_hash = $3, version_count = version_count + 1,
             last_updated_by = $4, last_updated_at = $5
         WHERE id = $1`,
        [p.blockId, rows[0]?.content, p.contentHash, p.updatedBy, event.occurred_at]
      );
      break;
    }
    case 'ReferenceAdded':
      await client.query(
        `INSERT INTO reference_views (id, source_block_id, target_block_id, target_version_id, target_hash, is_outdated, updated_at)
         VALUES ($1, $2, $3, $4, $5, FALSE, $6) ON CONFLICT (id) DO NOTHING`,
        [p.referenceId, p.sourceBlockId, p.targetBlockId, p.targetVersionId, p.targetHash, event.occurred_at]
      );
      break;
    default:
      // Other events don't affect read models directly
      break;
  }
}

if (require.main === module) {
  run().then((result) => {
    console.log('[Agent:EventReplay] Result:', result);
    db.end();
  }).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { run };
