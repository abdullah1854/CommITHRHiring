CREATE TABLE "commit_hr"."job_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "department" VARCHAR(100) NOT NULL,
  "location" VARCHAR(100) NOT NULL DEFAULT 'Remote',
  "employment_type" VARCHAR(50) NOT NULL DEFAULT 'full_time',
  "seniority" VARCHAR(50) NOT NULL DEFAULT 'mid',
  "required_skills" TEXT NOT NULL DEFAULT '[]',
  "preferred_skills" TEXT NOT NULL DEFAULT '[]',
  "description" TEXT NOT NULL,
  "responsibilities" TEXT NOT NULL,
  "qualifications" TEXT NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "job_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_templates_created_by_id_idx"
  ON "commit_hr"."job_templates"("created_by_id");

CREATE INDEX "job_templates_department_idx"
  ON "commit_hr"."job_templates"("department");
