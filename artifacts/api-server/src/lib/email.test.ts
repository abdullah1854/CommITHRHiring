import test from "node:test";
import assert from "node:assert/strict";

import { buildInterviewIcs } from "./email.js";

test("buildInterviewIcs includes escaped title, candidate, and start/end times", () => {
  const ics = buildInterviewIcs({
    id: "interview-123",
    candidateName: "Jane, Doe",
    jobTitle: "Project Manager; ERP",
    interviewerName: "Francis",
    interviewType: "phone_screen",
    scheduledAt: new Date("2026-04-26T09:00:00.000Z"),
    durationMinutes: 45,
    location: "HQ; Room 1",
    meetingLink: "https://meet.example/interview",
    now: new Date("2026-04-26T08:00:00.000Z"),
  });

  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /UID:interview-123@giq-recruitment/);
  assert.match(ics, /DTSTAMP:\d{8}T\d{6}Z/);
  assert.match(ics, /DTSTART:20260426T090000Z/);
  assert.match(ics, /DTEND:20260426T094500Z/);
  assert.match(ics, /SUMMARY:Interview: Project Manager\\; ERP — Jane\\, Doe/);
  assert.match(ics, /LOCATION:HQ\\; Room 1/);
  assert.match(ics, /URL:https:\/\/meet\.example\/interview/);
});
