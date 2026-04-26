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

test("sanitizeExtractedSkills removes candidate names and section headings", () => {
  const cleaned = sanitizeExtractedSkills(
    ["Balaraj Maruthur", "Core Skills", "Power BI", "Finance Process Improvement", "power bi"],
    "Balaraj Maruthur",
  );

  assert.deepEqual(cleaned, ["Power BI", "Finance Process Improvement"]);
});
