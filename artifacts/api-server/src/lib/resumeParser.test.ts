import test from "node:test";
import assert from "node:assert/strict";

import {
  extractCandidateNameFromResumeText,
  isLikelyCorruptExtractedName,
  resolveCandidateDisplayName,
  sanitizeExtractedSkills,
} from "./resumeParser.js";

test("extractCandidateNameFromResumeText strips trailing certifications", () => {
  const resumeText = `Balaraj Maruthur, PMP, CSM, CSPO, ITIL

+65 81248795 | mbalaraj_2004@yahoo.com | Singapore PR | Immediate Joiner

Project Manager – Finance Transformation, AI & Process Improvement

Core Skills`;

  assert.equal(extractCandidateNameFromResumeText(resumeText), "Balaraj Maruthur");
});

test("resolveCandidateDisplayName falls back to a cleaned filename when header text is corrupted", () => {
  const resumeText = `Lau Pek Huongynthea@hotmail.com │ +6591388175│ Malaysian (SG PR) │Availability: Immediate

Professional Summary

Senior Product Owner and Digital Transformation Leader`;

  assert.equal(
    resolveCandidateDisplayName({
      override: null,
      aiFullName: "Employment History",
      resumeText,
      filename: "Pek Huong Lau Project Manager Resume.docx",
    }),
    "Pek Huong Lau",
  );
});

test("isLikelyCorruptExtractedName rejects section headings", () => {
  assert.equal(isLikelyCorruptExtractedName("Employment History"), true);
  assert.equal(isLikelyCorruptExtractedName("Core Skills"), true);
});

test("rejects role headlines that are not personal names", () => {
  // Resume top-line headlines that are not the candidate's name. Without these
  // rejections the header parser used to surface them on the candidate card.
  assert.equal(isLikelyCorruptExtractedName("AI Innovation Leader"), true);
  assert.equal(isLikelyCorruptExtractedName("Digital Transformation Leader"), true);
  assert.equal(isLikelyCorruptExtractedName("Head of Engineering"), true);

  const headerThenName = `AI Innovation Leader

Abdullah Sarfaraz

Singapore | +65 …
abdullah@example.com`;
  assert.equal(extractCandidateNameFromResumeText(headerThenName), "Abdullah Sarfaraz");
});

test("section headings like 'Core Strengths' do not become the candidate name", () => {
  // Section markers must be skipped as section headings, not parsed as names.
  assert.equal(isLikelyCorruptExtractedName("Core Strengths"), true);
  assert.equal(isLikelyCorruptExtractedName("Career Profile"), true);
  assert.equal(isLikelyCorruptExtractedName("Areas of Expertise"), true);

  // Resume body where the headline + name come above a "Core Strengths" block.
  const cv = `AI Innovation Leader
Abdullah Sarfaraz
Singapore  ·  abdullah@example.com  ·  +65 9000 0000

Core Strengths
- Project delivery
- Stakeholder management`;
  assert.equal(extractCandidateNameFromResumeText(cv), "Abdullah Sarfaraz");

  // And the full resolution path falls through to the AI-extracted name when
  // the header parser picks up nothing usable.
  assert.equal(
    resolveCandidateDisplayName({
      override: null,
      aiFullName: "Abdullah Sarfaraz",
      resumeText: "Core Strengths\nProject delivery, stakeholder management.",
      filename: "Abdullah_Sarfaraz_CV.pdf",
    }),
    "Abdullah Sarfaraz",
  );
});

test("sanitizeExtractedSkills removes candidate names and section headings", () => {
  const cleaned = sanitizeExtractedSkills(
    ["Balaraj Maruthur", "Core Skills", "Power BI", "Finance Process Improvement", "power bi"],
    "Balaraj Maruthur",
  );

  assert.deepEqual(cleaned, ["Power BI", "Finance Process Improvement"]);
});
