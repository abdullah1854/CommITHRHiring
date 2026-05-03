import * as assert from "node:assert/strict";

import {
  buildScoringProvenance,
  formatScoreTimestamp,
} from "../src/lib/scoring-provenance";

const provenance = buildScoringProvenance({
  cacheReason: "normalized_resume_match",
  cacheKey: "abcdef1234567890",
  mode: "standard",
  resumeFileSha: "same-normalized-text-fingerprint",
  createdAt: "2026-05-03T02:00:00.000Z",
  duplicateScoreCount: 3,
  duplicateCandidateCount: 2,
});

assert.equal(provenance.primaryBadge, "Reused score");
assert.equal(provenance.badges.includes("Duplicate CV"), true);
assert.equal(provenance.detailLines.includes("Same normalized CV text has been scored before for this job."), true);
assert.equal(provenance.detailLines.includes("2 candidates share this score fingerprint."), true);
assert.equal(provenance.detailLines.includes("Cache key abcdef123456"), true);
assert.equal(provenance.detailLines.includes("Mode standard"), true);

const fresh = buildScoringProvenance({
  cacheReason: null,
  cacheKey: null,
  duplicateScoreCount: 1,
  duplicateCandidateCount: 1,
});

assert.equal(fresh.primaryBadge, "Fresh score");
assert.deepEqual(fresh.badges, []);
assert.equal(fresh.detailLines.includes("Generated specifically for this candidate/job pair."), true);

assert.equal(formatScoreTimestamp("2026-05-03T02:00:00.000Z"), "May 3, 2026");
assert.equal(formatScoreTimestamp(null), null);
