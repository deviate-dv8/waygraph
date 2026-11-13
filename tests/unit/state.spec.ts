import { test } from "node:test";
import assert from "node:assert/strict";
import { keys, MemPage, state } from "../../src/index.js";
import { applyStates, declareNeeds, markStates, setState, stateNow, unmetNeeds } from "../../src/engine/mem/state.js";
import { checkpoint } from "../../src/engine/checkpoint/checkpoint.js";

const Auth = keys("stateUnit")<{ signedIn: boolean; role: string }>({ signedIn: state(false), role: state("guest") });

test("an enum state: a page needs a value, a step sets one", () => {
  declareNeeds({}, "UnitAdmin", undefined, [[Auth.role, "admin"]]);
  const mem = new MemPage();
  assert.deepEqual(unmetNeeds("UnitAdmin", mem), ["stateUnit.role=admin"]);
  const promote = {};
  markStates(promote, { sets: [[Auth.role, "admin"]] });
  applyStates(promote, checkpoint("UnitAdmin"), mem);
  assert.equal(stateNow(mem, Auth.role), "admin");
  assert.deepEqual(unmetNeeds("UnitAdmin", mem), []);
});

test("states per pane: one person signed in is not the other signed in", () => {
  declareNeeds({}, "UnitInside", undefined, [Auth.signedIn]);
  const mem = new MemPage();
  setState(mem, Auth.signedIn, true, "standard");
  assert.deepEqual(unmetNeeds("UnitInside", mem, "standard"), []);
  assert.deepEqual(unmetNeeds("UnitInside", mem, "problem"), ["stateUnit.signedIn"]);
  assert.throws(() => applyStates({}, checkpoint("UnitInside"), mem, undefined, "problem"), /problem isn't in that state/);
});
