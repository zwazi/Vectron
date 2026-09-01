"use strict";

function revocationError(status, message) {
  return Object.assign(new Error(message), {status});
}

function validateSubmissionRevocation(submission, userUid, expectedStoragePath) {
  if(!submission) {
    throw revocationError(404, "This map submission no longer exists.");
  }
  if(submission.submittedBy !== userUid) {
    throw revocationError(403, "Only the submitter can revoke this map review.");
  }
  if(submission.status !== "pending") {
    throw revocationError(409, "This map review is no longer pending and cannot be revoked.");
  }
  if(submission.storagePath !== expectedStoragePath) {
    throw revocationError(
      409,
      "This review changed while it was being restored. Refresh and try again."
    );
  }
  return submission;
}

module.exports = {validateSubmissionRevocation};
