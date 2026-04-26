CREATE TABLE "commit_hr"."screening_cache" (
  "cache_key" VARCHAR(128) NOT NULL,
  "job_id" UUID NOT NULL,
  "resume_file_sha" VARCHAR(64) NOT NULL,
  "mode" VARCHAR(20) NOT NULL DEFAULT 'standard',
  "match_score" REAL NOT NULL,
  "fit_label" VARCHAR(50) NOT NULL,
  "payload" JSONB NOT NULL,
  "raw_response" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "screening_cache_pkey" PRIMARY KEY ("cache_key")
);

CREATE INDEX "screening_cache_job_id_resume_file_sha_mode_idx"
  ON "commit_hr"."screening_cache"("job_id", "resume_file_sha", "mode");

CREATE INDEX "screening_cache_resume_file_sha_idx"
  ON "commit_hr"."screening_cache"("resume_file_sha");

CREATE INDEX "screening_cache_created_at_idx"
  ON "commit_hr"."screening_cache"("created_at");
