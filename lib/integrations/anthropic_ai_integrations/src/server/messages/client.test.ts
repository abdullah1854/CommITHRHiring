import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAnthropicJsonMessageRequest,
  parseAnthropicJsonMessage,
} from "./client.js";

test("buildAnthropicJsonMessageRequest maps shared JSON chat options to Anthropic Messages shape", () => {
  const request = buildAnthropicJsonMessageRequest({
    model: "claude-sonnet-4-5",
    system: "Return JSON only.",
    user: "Score this candidate.",
    maxTokens: 4096,
    temperature: 0,
  });

  assert.deepEqual(request, {
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    temperature: 0,
    system: "Return JSON only. Respond with valid JSON only; do not include markdown fences.",
    messages: [{ role: "user", content: "Score this candidate." }],
  });
});

test("parseAnthropicJsonMessage recovers JSON from Anthropic text blocks and code fences", () => {
  const parsed = parseAnthropicJsonMessage<{ score: number }>({
    content: [
      { type: "text", text: "```json\n{\"score\": 92}\n```" },
      { type: "thinking", thinking: "not exposed" },
    ],
  });

  assert.deepEqual(parsed, { score: 92 });
});
