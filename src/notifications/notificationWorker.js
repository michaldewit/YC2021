const eventBus = require('../events/eventBus');
const db = require('../db/client');

async function sendNotification(recipientId, type, payload) {
  console.log(`[NOTIFICATION] → user:${recipientId} type:${type}`, payload);
  // In production: integrate email/Slack/webhook here
}

async function handleBlockUpdated(payload) {
  const { documentId, blockId, contentHash } = payload;

  // Notify document author that a block changed and re-approval may be needed
  const { rows: docs } = await db.query(
    'SELECT author_id, title FROM documents WHERE id = $1',
    [documentId]
  );
  if (!docs.length) return;
  const { author_id, title } = docs[0];

  await sendNotification(author_id, 'BlockContentChanged', {
    documentId,
    blockId,
    title,
    message: `A block in document "${title}" was updated. Re-approval may be required.`,
  });

  // Notify pending approvers
  const { rows: approvals } = await db.query(
    `SELECT approver_id FROM approvals WHERE document_id = $1 AND decision IS NULL`,
    [documentId]
  );
  for (const a of approvals) {
    await sendNotification(a.approver_id, 'DocumentChangedDuringApproval', {
      documentId,
      blockId,
      message: `Document "${title}" was modified during your approval review.`,
    });
  }
}

async function handleApprovalSubmitted(payload) {
  const { documentId, approvers = [] } = payload;
  const { rows: docs } = await db.query('SELECT title FROM documents WHERE id = $1', [documentId]);
  const title = docs[0]?.title || documentId;

  for (const approverId of approvers) {
    await sendNotification(approverId, 'ApprovalRequested', {
      documentId,
      message: `You have been requested to approve document "${title}".`,
    });
  }
}

async function handleApprovalDecided(payload) {
  const { documentId, approverId, decision } = payload;
  const { rows: docs } = await db.query(
    'SELECT author_id, title FROM documents WHERE id = $1',
    [documentId]
  );
  if (!docs.length) return;
  const { author_id, title } = docs[0];

  await sendNotification(author_id, 'ApprovalDecision', {
    documentId,
    decision,
    decidedBy: approverId,
    message: `Document "${title}" was ${decision} by approver ${approverId}.`,
  });
}

async function handleUserDeactivated(payload) {
  const { userId, impactReport } = payload;
  // In a real system: notify an admin
  console.log(`[NOTIFICATION] Admin: user ${userId} deactivated. Impact:`, impactReport);
}

async function startNotificationWorker() {
  await eventBus.subscribe('BlockUpdated', handleBlockUpdated, 'notif_block_updated');
  await eventBus.subscribe('ApprovalSubmitted', handleApprovalSubmitted, 'notif_approval_submitted');
  await eventBus.subscribe('ApprovalDecided', handleApprovalDecided, 'notif_approval_decided');
  await eventBus.subscribe('UserDeactivated', handleUserDeactivated, 'notif_user_deactivated');
  console.log('Notification worker started');
}

module.exports = { startNotificationWorker };
