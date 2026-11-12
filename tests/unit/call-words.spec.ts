import { test } from "node:test";
import assert from "node:assert/strict";
import { callName, maskBody, maskHeaders, routeOf, statusWords } from "../../src/engine/run/call-words.js";

test("a status in words, a route with its ids folded", () => {
  assert.equal(statusWords(201), "201 Created");
  assert.equal(statusWords(0), "No response");
  assert.equal(statusWords(299), "299");
  assert.equal(routeOf("https://x.dev/users/3f2a9c1e-1111-2222-3333-444455556666/orders/12?page=2"), "/users/:id/orders/:id");
  assert.equal(callName("get", "http://localhost:3000/posts/5"), "GET /posts/:id");
});

test("credentials are masked in headers and bodies, other fields are kept", () => {
  assert.deepEqual(maskHeaders({ Authorization: "Bearer abc", accept: "json" }), { Authorization: "••••", accept: "json" });
  assert.deepEqual(maskBody('{"user":"a","password":"p","nested":{"apiKey":"k","n":1}}', "application/json"), { user: "a", password: "••••", nested: { apiKey: "••••", n: 1 } });
  assert.equal(maskBody("user=a&password=p", "application/x-www-form-urlencoded"), "user=a&password=••••");
  assert.equal(maskBody("plain"), "plain");
});
