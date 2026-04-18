class BaseCommandHandler {
  constructor(db, eventBus) {
    this.db = db;
    this.eventBus = eventBus;
  }

  async execute(command) {
    throw new Error(`${this.constructor.name}.execute() not implemented`);
  }

  async emit(eventType, aggregateType, aggregateId, payload) {
    const client = await this.db.connect();
    try {
      const { rows } = await client.query(
        `INSERT INTO events (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [eventType, aggregateType, aggregateId, payload]
      );
      const event = rows[0];
      await this.eventBus.publish(eventType, { ...payload, _eventId: event.id, _occurredAt: event.occurred_at });
      return event;
    } finally {
      client.release();
    }
  }
}

module.exports = BaseCommandHandler;
