import assert from "node:assert/strict";
import { test } from "node:test";
import { rowWinner, verdict } from "./compare-rules.js";

const a = { name: "A", avg_rating: 4.5, avg_difficulty: 3.0, num_ratings: 10 };
const b = { name: "B", avg_rating: 3.9, avg_difficulty: 2.1, num_ratings: 400 };
const c = { name: "C", avg_rating: 4.5, avg_difficulty: null, num_ratings: 5 };

test("higher wins, lower wins, and a tie crowns nobody", () => {
  assert.equal(rowWinner([a, b], "avg_rating", 1), 4.5);
  assert.equal(rowWinner([a, b], "avg_difficulty", -1), 2.1);
  assert.equal(rowWinner([a, b, c], "avg_rating", 1), null);
});

test("missing data never wins, and one value alone is no contest", () => {
  assert.equal(rowWinner([a, b, c], "avg_difficulty", -1), 2.1);
  assert.equal(rowWinner([a, c], "avg_difficulty", -1), null);
});

test("rows that are a matter of taste are shown but never judged", () => {
  const rows = [["Overall", "avg_rating", null, 1, "Best rated"], ["Ratings", "num_ratings", null, 0],
    ["Difficulty", "avg_difficulty", null, -1, "Easiest"]];
  assert.deepEqual(verdict([a, b], rows), [["Best rated", a], ["Easiest", b]]);
});
