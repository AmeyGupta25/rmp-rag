import assert from "node:assert/strict";
import { test } from "node:test";
import { sortRows } from "./sort-rows.js";

const rows = [{ n: "a", q: 3.1 }, { n: "b", q: null }, { n: "c", q: 4.5 }, { n: "d", q: 1.2 }];

test("high first, missing last", () => assert.deepEqual(sortRows(rows, "q", 1).map((r) => r.n), ["c", "a", "d", "b"]));
test("low first (difficulty), missing still last", () => assert.deepEqual(sortRows(rows, "q", -1).map((r) => r.n), ["d", "a", "c", "b"]));
