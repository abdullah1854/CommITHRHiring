ALTER TABLE "commit_hr"."resumes"
  ADD COLUMN IF NOT EXISTS "text_fingerprint" VARCHAR(64);

ALTER TABLE "commit_hr"."ai_screening_results"
  ADD COLUMN IF NOT EXISTS "resume_text_fingerprint" VARCHAR(64);

ALTER TABLE "commit_hr"."screening_cache"
  ADD COLUMN IF NOT EXISTS "resume_text_fingerprint" VARCHAR(64);

CREATE INDEX IF NOT EXISTS "resumes_text_fingerprint_idx"
  ON "commit_hr"."resumes"("text_fingerprint");

CREATE INDEX IF NOT EXISTS "ai_screening_results_job_resume_text_fingerprint_mode_idx"
  ON "commit_hr"."ai_screening_results"("job_id", "resume_text_fingerprint", "mode");

CREATE INDEX IF NOT EXISTS "screening_cache_job_resume_text_fingerprint_mode_idx"
  ON "commit_hr"."screening_cache"("job_id", "resume_text_fingerprint", "mode");

CREATE INDEX IF NOT EXISTS "screening_cache_resume_text_fingerprint_idx"
  ON "commit_hr"."screening_cache"("resume_text_fingerprint");
