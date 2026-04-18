/**
 * End-to-End Test Runner
 * Scenario: Create document → add block → reference block → submit for approval →
 *           change block → detect outdated reference → re-approval required
 */
const http = require('http');

const BASE = process.env.API_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;

async function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function run() {
  console.log('=== E2E Test: Document Approval Flow ===\n');

  // --- Step 0: health check ---
  console.log('0. Health check');
  const health = await request('GET', '/health');
  assert(health.status === 200, 'API is reachable');

  // --- Step 1: Create users ---
  console.log('\n1. Create users');
  const u1 = await request('POST', '/users', { name: 'Alice', email: `alice_${Date.now()}@test.com` });
  const u2 = await request('POST', '/users', { name: 'Bob', email: `bob_${Date.now()}@test.com` });
  const u3 = await request('POST', '/users', { name: 'Carol', email: `carol_${Date.now()}@test.com` });
  assert(u1.status === 201 && u1.body.id, 'Author (Alice) created');
  assert(u2.status === 201 && u2.body.id, 'Approver 1 (Bob) created');
  assert(u3.status === 201 && u3.body.id, 'Approver 2 (Carol) created');

  const authorId = u1.body.id;
  const approver1Id = u2.body.id;

  // --- Step 2: Create document ---
  console.log('\n2. Create document');
  const docRes = await request('POST', '/documents', { title: 'Test Document', authorId });
  assert(docRes.status === 201 && docRes.body.id, 'Document created');
  const documentId = docRes.body.id;

  // --- Step 3: Add block ---
  console.log('\n3. Add block');
  const blockRes = await request('POST', `/documents/${documentId}/blocks`, { userId: authorId });
  assert(blockRes.status === 201 && blockRes.body.id, 'Block added');
  const blockId = blockRes.body.id;

  // --- Step 4: Set block content ---
  console.log('\n4. Set block content');
  const contentRes = await request('PATCH', `/blocks/${blockId}/content`, {
    content: 'Initial block content',
    userId: authorId,
  });
  assert(contentRes.status === 200 && contentRes.body.versionId, 'Block content set, version created');
  const versionId = contentRes.body.versionId;

  // --- Step 5: Add a second block and reference the first ---
  console.log('\n5. Add second block and create reference');
  const block2Res = await request('POST', `/documents/${documentId}/blocks`, { userId: authorId });
  assert(block2Res.status === 201, 'Second block added');
  const block2Id = block2Res.body.id;

  await request('PATCH', `/blocks/${block2Id}/content`, { content: 'Referencing block', userId: authorId });

  const refRes = await request('POST', `/blocks/${block2Id}/references`, {
    targetBlockId: blockId,
    userId: authorId,
  });
  assert(refRes.status === 201 && refRes.body.id, 'Reference from block2 to block1 created');

  // --- Step 6: Submit for approval ---
  console.log('\n6. Submit for approval');
  const submitRes = await request('POST', `/documents/${documentId}/submit-for-approval`, {
    submittedBy: authorId,
  });
  assert(submitRes.status === 200 && submitRes.body.approvalIds?.length === 2, 'Submitted for approval with 2 approvers');

  // --- Step 7: Check document status ---
  console.log('\n7. Verify document status');
  await new Promise((r) => setTimeout(r, 300)); // allow projection to settle
  const docView = await request('GET', `/documents/${documentId}`);
  assert(docView.body.status === 'pending_approval', 'Document status is pending_approval');

  // --- Step 8: Change block content (outdated reference) ---
  console.log('\n8. Change block content');
  const update2Res = await request('PATCH', `/blocks/${blockId}/content`, {
    content: 'Updated block content — changes hash',
    userId: authorId,
  });
  assert(update2Res.status === 200, 'Block content updated');

  // --- Step 9: Verify outdated reference detected ---
  console.log('\n9. Verify outdated reference detected');
  await new Promise((r) => setTimeout(r, 300));
  const outdatedRefs = await request('GET', `/documents/${documentId}/outdated-references`);
  assert(Array.isArray(outdatedRefs.body) && outdatedRefs.body.length > 0, 'Outdated reference detected');

  // --- Step 10: Verify re-submission fails due to outdated refs ---
  console.log('\n10. Verify re-submission blocked on outdated refs');
  const resubmit = await request('POST', `/documents/${documentId}/submit-for-approval`, {
    submittedBy: authorId,
  });
  assert(resubmit.status === 400, 'Re-submission correctly blocked due to outdated references');

  // --- Summary ---
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('E2E test crashed:', err);
  process.exit(1);
});
