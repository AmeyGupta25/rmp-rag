// The overall rating as it stood at the end of each quarter: a running average over every review so far.
// Weekly rating snapshots only start when the pipeline did, so they can't show a professor's history yet.
export function ratingPoints(byQuarter) {
  let sum = 0, n = 0;
  return byQuarter.filter((q) => q.avg_quality != null).map((q) => {
    sum += q.avg_quality * q.reviews; n += q.reviews;
    return { label: q.review_quarter, value: sum / n };
  });
}
