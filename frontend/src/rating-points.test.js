import assert from "node:assert/strict";
import { test } from "node:test";
import { ratingPoints } from "./rating-points.js";

test("each point is the running average of every review so far, weighted by count", () => {
  const pts = ratingPoints([
    { review_quarter: "2024-FA", reviews: 1, avg_quality: 2 },
    { review_quarter: "2025-WI", reviews: 3, avg_quality: 4 },
    { review_quarter: "2025-SP", reviews: 2, avg_quality: null },
  ]);
  assert.deepEqual(pts, [{ label: "2024-FA", value: 2 }, { label: "2025-WI", value: 3.5 }]);
});
