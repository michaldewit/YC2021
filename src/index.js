const app = require('./api/app');
const eventBus = require('./events/eventBus');
const { startProjectionWorker } = require('./projections/projectionWorker');
const { startNotificationWorker } = require('./notifications/notificationWorker');

const PORT = process.env.PORT || 3000;

async function start() {
  await eventBus.connect();
  await startProjectionWorker();
  await startNotificationWorker();

  app.listen(PORT, () => {
    console.log(`Document Approval API listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
