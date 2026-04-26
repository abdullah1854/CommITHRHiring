CREATE TABLE "commit_hr"."interview_scorecards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "interview_id" UUID NOT NULL,
  "technical_score" INTEGER,
  "role_fit_score" INTEGER,
  "communication_score" INTEGER,
  "culture_score" INTEGER,
  "recommendation" VARCHAR(50) NOT NULL DEFAULT 'hold',
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "interview_scorecards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "interview_scorecards_interview_id_key" UNIQUE ("interview_id"),
  CONSTRAINT "interview_scorecards_interview_id_fkey"
    FOREIGN KEY ("interview_id") REFERENCES "commit_hr"."interviews"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "interview_scorecards_interview_id_idx"
  ON "commit_hr"."interview_scorecards"("interview_id");
