import { describe, expect, it } from "vitest";
import { reportDue, statsSummary, type StatDelta } from "../lib/stats/core";

const row: StatDelta = {
  id: "one", date: "2026-10-07", userId: "123", displayName: "Player A",
  channelId: "456", channelName: "general", messages: 3, voiceSeconds: 3_600, recordedAt: "2026-10-07T13:00:00Z",
};

describe("Discord server statistics", () => {
  it("counts each batch once and groups message and voice totals by member, channel and day", () => {
    const summary = statsSummary([
      row, row,
      { ...row, id: "two", userId: "789", displayName: "Player B", channelId: "999", channelName: "voice", messages: 0, voiceSeconds: 1_800 },
      { ...row, id: "old", date: "2026-09-20", messages: 100 },
    ], "2026-10-08", 7);
    expect(summary.messages).toBe(3);
    expect(summary.voiceSeconds).toBe(5_400);
    expect(summary.activeMembers).toBe(2);
    expect(summary.daily.find((day) => day.date === "2026-10-07")).toMatchObject({ messages: 3, voiceSeconds: 5_400 });
    expect(summary.channels).toHaveLength(2);
  });

  it("posts the prior complete Manila day after the selected daily time", () => {
    const config = { channelId: "123456789012345678", frequency: "daily" as const, time: "09:00", timeZone: "Asia/Manila" };
    expect(reportDue(new Date("2026-10-08T00:59:00Z"), config)).toEqual({ key: "daily:2026-10-07", end: "2026-10-06", days: 1 });
    expect(reportDue(new Date("2026-10-08T01:01:00Z"), config)).toEqual({ key: "daily:2026-10-08", end: "2026-10-07", days: 1 });
  });

  it("runs weekly on Monday after the selected time and catches up after downtime", () => {
    const config = { channelId: "123456789012345678", frequency: "weekly" as const, time: "09:00", timeZone: "Asia/Manila" };
    expect(reportDue(new Date("2026-10-04T23:30:00Z"), config)).toEqual({ key: "weekly:2026-09-28", end: "2026-09-27", days: 7 });
    expect(reportDue(new Date("2026-10-05T02:00:00Z"), config)).toEqual({ key: "weekly:2026-10-05", end: "2026-10-04", days: 7 });
    expect(reportDue(new Date("2026-10-07T12:00:00Z"), config)).toEqual({ key: "weekly:2026-10-05", end: "2026-10-04", days: 7 });
  });
});
