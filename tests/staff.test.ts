import { describe, expect, it } from "vitest";
import { staffFromDiscord } from "../checkin-worker/staff";
import { observedStaff, staffPerformance, STAFF_ROLE_IDS, validatePins, type StaffMember } from "../lib/staff/core";
import type { StatDelta } from "../lib/stats/core";

const [role] = STAFF_ROLE_IDS;
const alice = "111111111111111111";
const bob = "222222222222222222";
const member = (id: string, firstSeen = "2026-10-09"): StaffMember => ({ id, name: id === alice ? "Alice" : "Bob", roleIds: [role], firstSeen });
const message = (id: string, date: string, userId: string, messages: number): StatDelta => ({
  id, date, userId, displayName: userId === alice ? "Alice" : "Bob", channelId: "channel", channelName: "general",
  messages, voiceSeconds: 0, recordedAt: `${date}T12:00:00Z`, roleIds: [role], isBot: false,
});

describe("Staff Corner quotas", () => {
  it("scores 50 each day and 145 across Saturday–Sunday, keeping today in progress", () => {
    const staff = staffPerformance({ live: [
      message("a-sat", "2026-10-10", alice, 70), message("a-sun", "2026-10-11", alice, 80), message("a-mon", "2026-10-12", alice, 10),
      message("b-sat", "2026-10-10", bob, 40), message("b-sun", "2026-10-11", bob, 60),
    ], history: [], progress: [], plan: null, roster: [member(alice), member(bob)], pins: [bob],
    today: "2026-10-12", start: "2026-10-09", end: "2026-10-12" });
    expect(staff.map((person) => person.id)).toEqual([bob, alice]);
    expect(staff[1]).toMatchObject({ dailySuccess: 2, dailyFailure: 0, weekendSuccess: 1, weekendFailure: 0, success: 3, failure: 0,
      todayMessages: 10, selectedMessages: 160 });
    expect(staff[1].daily[0]).toMatchObject({ date: "2026-10-12", status: "in_progress", remark: "40 remaining" });
    expect(staff[1].daily.at(-1)).toMatchObject({ date: "2026-10-09", status: "not_started" });
    expect(staff[0]).toMatchObject({ dailySuccess: 1, dailyFailure: 1, weekendSuccess: 0, weekendFailure: 1, success: 1, failure: 2 });
    expect(staff[0].weekends[0]).toMatchObject({ messages: 100, status: "failure", remark: "Missed by 45" });
  });

  it("does not mark an unfinished Sunday weekend as a failure", () => {
    const [staff] = staffPerformance({ live: [message("sat", "2026-10-10", alice, 50)], history: [], progress: [], plan: null,
      roster: [member(alice)], pins: [], today: "2026-10-11", start: "2026-10-10", end: "2026-10-11" });
    expect(staff.currentWeekend).toMatchObject({ messages: 50, status: "in_progress", remark: "95 remaining" });
    expect(staff.weekendFailure).toBe(0);
    expect(staff.daily[0]).toMatchObject({ date: "2026-10-11", status: "in_progress" });
  });

  it("replaces overlapping live messages with covered history and deduplicates retried appends", () => {
    const live = message("live", "2026-10-07", alice, 2);
    const imported = message("history:channel:2026-10-07:alice", "2026-10-07", alice, 55);
    const [staff] = staffPerformance({ live: [live], history: [imported, imported],
      progress: [{ channelId: "channel", channelName: "general", before: "", coveredAfter: "2026-10-06", status: "running", error: "" }],
      plan: { from: "2026-10-01", until: "2026-10-08" }, roster: [member(alice, "2026-10-06")], pins: [],
      today: "2026-10-08", start: "2026-10-07", end: "2026-10-08" });
    expect(staff.daily.find((day) => day.date === "2026-10-07")).toMatchObject({ messages: 55, status: "success" });
  });

  it("limits pins to ten distinct listed staff", () => {
    const roster = Array.from({ length: 11 }, (_, i) => member(String(i + 1).padStart(18, "1")));
    expect(validatePins(roster.slice(0, 10).map((person) => person.id), roster)).toHaveLength(10);
    expect(() => validatePins(roster.map((person) => person.id), roster)).toThrow("up to 10");
    expect(() => validatePins([alice, alice], roster)).toThrow("different");
    expect(() => validatePins(["999999999999999999"], roster)).toThrow("current staff list");
  });
});

describe("Staff Corner roster", () => {
  it("selects both roles, excludes bots, and keeps first-seen dates on refresh", () => {
    const result = staffFromDiscord([
      { user: { id: alice, username: "alice", global_name: "Alice" }, nick: "Team Alice", roles: [role] },
      { user: { id: bob, username: "bob" }, roles: [STAFF_ROLE_IDS[1]] },
      { user: { id: "333333333333333333", username: "bot", bot: true }, roles: [role] },
      { user: { id: "444444444444444444", username: "other" }, roles: ["444444444444444444"] },
    ], [member(alice, "2026-10-08")], "2026-10-12");
    expect(result).toMatchObject([
      { id: bob, firstSeen: "2026-10-12", roleIds: [STAFF_ROLE_IDS[1]] },
      { id: alice, name: "Team Alice", firstSeen: "2026-10-08" },
    ]);
  });

  it("uses the first observed role date, not messages from before the staff role", () => {
    const rows = [message("before", "2026-10-03", alice, 3), message("after", "2026-10-09", alice, 4)];
    rows[0].roleIds = [];
    expect(observedStaff(rows)).toMatchObject([{ id: alice, firstSeen: "2026-10-09" }]);
  });
});
