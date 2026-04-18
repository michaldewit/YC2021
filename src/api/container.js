const db = require('../db/client');
const eventBus = require('../events/eventBus');

const CreateDocument = require('../commands/CreateDocument');
const AddBlock = require('../commands/AddBlock');
const UpdateBlockContent = require('../commands/UpdateBlockContent');
const UserDeactivated = require('../commands/UserDeactivated');
const SubmitForApproval = require('../approvals/SubmitForApproval');
const DecideApproval = require('../approvals/DecideApproval');
const AddReference = require('../references/AddReference');

module.exports = {
  createDocument: new CreateDocument(db, eventBus),
  addBlock: new AddBlock(db, eventBus),
  updateBlockContent: new UpdateBlockContent(db, eventBus),
  submitForApproval: new SubmitForApproval(db, eventBus),
  decideApproval: new DecideApproval(db, eventBus),
  addReference: new AddReference(db, eventBus),
  userDeactivated: new UserDeactivated(db, eventBus),
};
