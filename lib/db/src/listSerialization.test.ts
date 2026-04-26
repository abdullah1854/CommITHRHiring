import test from "node:test";
import assert from "node:assert/strict";

import { parseList, serializeList } from "./index.js";

test("parseList accepts arrays, JSON arrays, and comma-separated strings", () => {
  assert.deepEqual(parseList(["PMP", " Agile ", "pmp", ""]), ["PMP", "Agile"]);
  assert.deepEqual(parseList('["PMP","Agile","PMP"]'), ["PMP", "Agile"]);
  assert.deepEqual(parseList("PMP, Agile, , ERP"), ["PMP", "Agile", "ERP"]);
});

test("serializeList stores normalized JSON arrays", () => {
  assert.equal(serializeList(["PMP", " Agile ", "pmp"]), '["PMP","Agile"]');
  assert.equal(serializeList('["PMP","Agile"]'), '["PMP","Agile"]');
  assert.equal(serializeList("PMP, Agile"), '["PMP","Agile"]');
});

test("invalid or empty list values serialize to empty arrays", () => {
  assert.deepEqual(parseList(""), []);
  assert.equal(serializeList(null), "[]");
  assert.equal(serializeList({ value: "PMP" }), "[]");
});
