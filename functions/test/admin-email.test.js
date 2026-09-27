"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {deliverAdminEmail, reviewEmail, suggestionEmail, sendEmail} = require("../admin-email");

function harness() {
  const records = new Map();
  const ref = path => ({path, update:async data => records.set(path, {...records.get(path), ...data})});
  const db = {
    collection:name => ({doc:id => ref(`${name}/${id}`)}),
    runTransaction:async callback => callback({
      get:async reference => ({exists:records.has(reference.path), data:() => records.get(reference.path)}),
      create:(reference, data) => {assert.ok(!records.has(reference.path)); records.set(reference.path, data);},
      set:(reference, data) => records.set(reference.path, data)
    })
  };
  const sends = [];
  const options = {db, fieldValue:{serverTimestamp:() => 123}, key:"vectron/map/one",
    email:{subject:"Map awaiting review", text:"Review it"}, now:() => 1000000000,
    configLoader:async () => ({apiKey:"test", sender:"sender@example.com", recipient:"owner@example.com"}),
    sender:async args => {sends.push(args); return "email-1";}};
  return {records, sends, options};
}

test("map and registration creation require pending status", () => {
  assert.equal(reviewEmail("map", "id", {status:"approved"}), null);
  assert.match(reviewEmail("map", "id", {status:"pending", mapName:"Map\nInjected", authorName:"M3l0n"}).subject, /Map Injected$/);
  assert.match(reviewEmail("registration", "id", {status:"pending", email:"racer@example.com"}).text, /racer@example.com/);
});
test("sole-admin suggestions still produce email despite no Messages recipient", () => {
  assert.match(suggestionEmail("id", {authorId:"admin", authorName:"Admin", body:"Feature idea", source:"vectron", deliveryStatus:"no-recipient"}).text, /Feature idea/);
});
test("acknowledged deliveries are skipped on duplicate events and after restart", async () => {
  const h = harness();
  await deliverAdminEmail(h.options);
  await deliverAdminEmail({...h.options});
  assert.equal(h.sends.length, 1);
  assert.equal(h.records.get("adminEmailState/quota").dayCount, 1);
});
test("ambiguous provider failure retries with the original payload and key", async () => {
  const h = harness();
  const attempted = [];
  await assert.rejects(deliverAdminEmail({...h.options, sender:async args => {attempted.push(args); throw Error("timeout");}}));
  await deliverAdminEmail({...h.options, email:{subject:"changed", text:"changed"}});
  assert.equal(h.sends[0].key, attempted[0].key);
  assert.deepEqual(h.sends[0].payload, attempted[0].payload);
  assert.equal(h.records.get("adminEmailState/quota").dayCount, 1);
});
test("expired ambiguous sends are retained for review without risking duplicates", async () => {
  const h = harness();
  await assert.rejects(deliverAdminEmail({...h.options, sender:async () => {throw Error("timeout");}}));
  await assert.rejects(deliverAdminEmail({...h.options, now:() => h.options.now() + 24 * 3600000}), /operator attention/);
  assert.equal(h.sends.length, 0);
  assert.ok([...h.records.values()].some(x => x.status === "needs-attention"));
});
test("daily guard prevents sending more mail", async () => {
  const h = harness(); const date = new Date(h.options.now()).toISOString();
  h.records.set("adminEmailState/quota", {day:date.slice(0,10), dayCount:50});
  await assert.rejects(deliverAdminEmail(h.options), /safety limit/);
  assert.equal(h.sends.length, 0);
});
test("provider receives an idempotency header and must acknowledge a message id", async () => {
  const args = {config:{apiKey:"test"}, payload:{subject:"test"}, key:"one"};
  const id = await sendEmail({...args, fetchImpl:async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.headers["Idempotency-Key"], "one");
    return {ok:true, json:async () => ({id:"ack"})};
  }});
  assert.equal(id, "ack");
  await assert.rejects(sendEmail({...args, fetchImpl:async () => ({ok:true, json:async () => ({})})}), /acknowledge/);
  await assert.rejects(sendEmail({...args, fetchImpl:async () => ({ok:false, status:429})}), /429/);
});
