import test from "node:test";
import assert from "node:assert/strict";
import {
  dynamicRulesFor,
  historyToCsv,
  historyToText,
  hostMatches,
  normalizeHostname,
  shouldBlockTarget,
  uniqueHostnames
} from "../lib.js";

const settings = {
  enabled: true,
  blockCrossOriginPopups: true,
  protectedSites: ["example.com"],
  allowlist: ["trusted.test"],
  blocklist: ["bad.test"]
};

test("normalizes and deduplicates domains", () => {
  assert.equal(normalizeHostname("HTTPS://WWW.Example.com/path"), "example.com");
  assert.deepEqual(uniqueHostnames(["b.test", "https://a.test/x", "B.test"]), ["a.test", "b.test"]);
});

test("domain matching includes subdomains without matching suffix tricks", () => {
  assert.equal(hostMatches("cdn.example.com", ["example.com"]), true);
  assert.equal(hostMatches("notexample.com", ["example.com"]), false);
});

test("blocks listed domains globally", () => {
  assert.equal(shouldBlockTarget("https://safe.test", "https://img.bad.test/a", settings), true);
});

test("blocks cross-origin popups from protected sites", () => {
  assert.equal(shouldBlockTarget("https://example.com/watch", "https://other.test/ad", settings, { popup: true }), true);
  assert.equal(shouldBlockTarget("https://example.com/watch", "https://trusted.test/login", settings, { popup: true }), false);
  assert.equal(shouldBlockTarget("https://unprotected.test", "https://other.test/ad", settings, { popup: true }), false);
});

test("creates deterministic DNR rules", () => {
  const rules = dynamicRulesFor(["b.test", "a.test"]);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].condition.urlFilter, "||a.test^");
  assert.deepEqual(rules[0].condition.resourceTypes, ["main_frame", "sub_frame"]);
});

test("exports CSV safely and text as unique URLs", () => {
  const rows = [{ timestamp: "now", sourceUrl: "https://a.test", targetUrl: "https://bad.test/a,b", targetHost: "bad.test", kind: "popup", reason: "A, B" }];
  assert.match(historyToCsv(rows), /"https:\/\/bad\.test\/a,b"/);
  assert.equal(historyToText([...rows, ...rows]), "https://bad.test/a,b");
});
