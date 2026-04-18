const amqp = require('amqplib');
const { validateEvent } = require('./eventSchemas');

const EXCHANGE = 'document_approval_events';
const RECONNECT_DELAY_MS = 2000;

class EventBus {
  constructor(url) {
    this.url = url || process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
    this.connection = null;
    this.publishChannel = null;
    this.subscriptions = new Map();
  }

  async connect() {
    let attempts = 0;
    while (true) {
      try {
        this.connection = await amqp.connect(this.url);
        this.connection.on('error', (err) => {
          console.error('RabbitMQ connection error:', err.message);
          this._scheduleReconnect();
        });
        this.connection.on('close', () => {
          console.warn('RabbitMQ connection closed, reconnecting...');
          this._scheduleReconnect();
        });

        this.publishChannel = await this.connection.createChannel();
        await this.publishChannel.assertExchange(EXCHANGE, 'topic', { durable: true });
        console.log('EventBus connected to RabbitMQ');
        return;
      } catch (err) {
        attempts++;
        const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(2, attempts - 1), 30000);
        console.warn(`RabbitMQ connect attempt ${attempts} failed: ${err.message}. Retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  async publish(eventType, payload) {
    if (!this.publishChannel) throw new Error('EventBus not connected');

    const { valid, errors } = validateEvent(eventType, payload);
    if (!valid) {
      const detail = errors ? JSON.stringify(errors) : 'unknown';
      throw new Error(`Event schema validation failed for ${eventType}: ${detail}`);
    }

    const msg = JSON.stringify({ eventType, payload, publishedAt: new Date().toISOString() });
    this.publishChannel.publish(EXCHANGE, eventType, Buffer.from(msg), { persistent: true });
  }

  async subscribe(eventType, handler, queueName) {
    const channel = await this.connection.createChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

    const queue = queueName || `${eventType}_${Date.now()}`;
    await channel.assertQueue(queue, { durable: !!queueName });
    await channel.bindQueue(queue, EXCHANGE, eventType);
    channel.prefetch(1);

    channel.consume(queue, async (msg) => {
      if (!msg) return;
      try {
        const data = JSON.parse(msg.content.toString());
        await handler(data.payload, data);
        channel.ack(msg);
      } catch (err) {
        console.error(`Handler error for ${eventType}:`, err.message);
        channel.nack(msg, false, false);
      }
    });

    this.subscriptions.set(`${eventType}:${queue}`, channel);
    console.log(`Subscribed to ${eventType} on queue ${queue}`);
  }

  _scheduleReconnect() {
    setTimeout(() => this.connect().catch(console.error), RECONNECT_DELAY_MS);
  }

  async close() {
    for (const ch of this.subscriptions.values()) {
      await ch.close().catch(() => {});
    }
    if (this.publishChannel) await this.publishChannel.close().catch(() => {});
    if (this.connection) await this.connection.close().catch(() => {});
  }
}

module.exports = new EventBus();
