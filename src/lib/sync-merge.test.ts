import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { merge3 } from "./sync-merge";

const a = (id: string, name = id) => ({ id, name });

describe("merge3", () => {
  it("keeps both sides' additions to id arrays", () => {
    const base = { activities: [a("1")] };
    const local = { activities: [a("1"), a("phone")] };
    const remote = { activities: [a("1"), a("pc")] };
    assert.deepEqual(merge3(base, local, remote), { activities: [a("1"), a("phone"), a("pc")] });
  });

  it("applies an edit on one side and a delete on the other side's untouched item", () => {
    const base = { tasks: [a("t1"), a("t2")] };
    const local = { tasks: [a("t1", "editado"), a("t2")] };
    const remote = { tasks: [a("t1")] };
    assert.deepEqual(merge3(base, local, remote), { tasks: [a("t1", "editado")] });
  });

  it("keeps an item edited locally even if the other side deleted it", () => {
    const base = { tasks: [a("t1")] };
    assert.deepEqual(merge3(base, { tasks: [a("t1", "x")] }, { tasks: [] }), {
      tasks: [a("t1", "x")],
    });
  });

  it("merges different fields of the same item", () => {
    const base = { items: [{ id: "g", name: "Gym", hours: 1 }] };
    const local = { items: [{ id: "g", name: "Gimnasio", hours: 1 }] };
    const remote = { items: [{ id: "g", name: "Gym", hours: 2 }] };
    assert.deepEqual(merge3(base, local, remote), {
      items: [{ id: "g", name: "Gimnasio", hours: 2 }],
    });
  });

  it("merges primitive arrays as sets", () => {
    const base = { done: ["a", "b"] };
    const local = { done: ["a", "b", "c"] };
    const remote = { done: ["a", "d"] };
    assert.deepEqual(merge3(base, local, remote), { done: ["a", "c", "d"] });
  });

  it("scalars: the changed side wins, local wins a real conflict", () => {
    assert.deepEqual(merge3({ t: "light" }, { t: "light" }, { t: "dark" }), { t: "dark" });
    assert.deepEqual(merge3({ t: "light" }, { t: "dark" }, { t: "x" }), { t: "dark" });
  });

  it("object keys: added on either side are kept, removed untouched ones are dropped", () => {
    const base = { days: { d1: 1, d2: 2 } };
    const local = { days: { d1: 1, d2: 2, d3: 3 } };
    const remote = { days: { d1: 1 } };
    assert.deepEqual(merge3(base, local, remote), { days: { d1: 1, d3: 3 } });
  });

  it("without a base, both sides' items survive", () => {
    assert.deepEqual(merge3(undefined, { s: [a("1")] }, { s: [a("2")] }), { s: [a("1"), a("2")] });
  });
});
