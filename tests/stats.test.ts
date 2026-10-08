import { describe, expect, it } from "vitest";
import { channelDrilldownRows, reportDue, roleMemberPerformance, statsSummary, statsSummaryRange, type StatDelta } from "../lib/stats/core";
import { dateBoundarySnowflake } from "../checkin-worker/history";

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

  it("keeps idle discovered channels searchable without adding activity to totals", () => {
    const summary = statsSummaryRange([row], "2026-10-07", "2026-10-07");
    const progress = [{ channelId: "456", channelName: "general", before: "", coveredAfter: "2026-10-07", status: "running" as const, error: "" },
      { channelId: "idle", channelName: "quiet-channel", before: "", coveredAfter: "2026-10-07", status: "pending" as const, error: "" }];
    const drilldown = channelDrilldownRows(summary, progress);
    expect(drilldown).toMatchObject([
      { id: "456", messages: 3, voiceSeconds: 3_600, historyStatus: "running" },
      { id: "idle", name: "quiet-channel", messages: 0, voiceSeconds: 0, historyStatus: "pending" },
    ]);
    expect(drilldown.reduce((total, channel) => total + channel.messages, 0)).toBe(summary.messages);
  });

  it("uses completed history in place of overlapping live messages while retaining live voice time", () => {
    const live = { ...row, date: "2026-08-15", messages: 4, voiceSeconds: 300, roleIds: ["111111111111111111"] };
    const imported = { ...live, id: "history:456:2026-08-15:123", messages: 9, voiceSeconds: 0, isBot: true };
    const options = {
      history: [imported, imported],
      plan: { from: "2026-08-01", until: "2026-10-08" },
      progress: [{ channelId: "456", channelName: "general", before: "", coveredAfter: "2026-08-14", status: "running" as const, error: "" }],
      roleId: "111111111111111111",
    };
    const summary = statsSummaryRange([live], "2026-08-15", "2026-08-15", options);
    expect(summary).toMatchObject({ messages: 9, botMessages: 9, voiceSeconds: 300, activeMembers: 1 });
    expect(statsSummaryRange([live], "2026-08-15", "2026-08-15", { ...options, roleId: "222222222222222222" }).messages).toBe(0);
    expect(statsSummaryRange([live], "2026-08-15", "2026-08-15", { ...options, progress: [] }).messages).toBe(4);
  });

  it("anchors a single-day custom view and the import boundary to Manila dates", () => {
    expect(statsSummaryRange([row], "2026-10-07", "2026-10-07").daily).toHaveLength(1);
    const timestamp = Number(BigInt(dateBoundarySnowflake("2026-08-01", "Asia/Manila")) >> 22n) + 1_420_070_400_000;
    expect(new Date(timestamp).toISOString()).toBe("2026-07-31T16:00:00.000Z");
  });

  it("supports an all-time window beyond one year", () => {
    const summary = statsSummaryRange([row], "2024-09-01", "2026-10-08");
    expect(summary.messages).toBe(3);
    expect(summary.daily[0].date).toBe("2024-09-01");
    expect(summary.daily.at(-1)?.date).toBe("2026-10-08");
  });

  it("lists observed role players who were idle in the selected dates, excluding bots and incomplete history", () => {
    const roleId = "111111111111111111";
    const old = { ...row, id: "old", date: "2026-08-15", userId: "old-player", displayName: "Idle player", roleIds: [roleId] };
    const active = { ...row, id: "active", userId: "active-player", displayName: "Active player", messages: 5, roleIds: [roleId] };
    const untracked = { ...row, id: "different", userId: "different-player", roleIds: ["222222222222222222"] };
    const bot = { ...row, id: "bot", userId: "bot-user", isBot: true, roleIds: [roleId] };
    const imported = { ...old, id: "history:456:2026-08-15:old-player" };
    const plan = { from: "2026-08-01", until: "2026-10-08" };
    const period = statsSummaryRange([active, untracked, bot], "2026-10-07", "2026-10-07").members;
    expect(roleMemberPerformance([active, untracked, bot], [imported], [], plan, roleId, period).map((member) => member.id))
      .toEqual(["active-player"]);
    const progress = [{ channelId: "456", channelName: "general", before: "", coveredAfter: "2026-08-14", status: "running" as const, error: "" }];
    expect(roleMemberPerformance([active, untracked, bot], [imported], progress, plan, roleId, period))
      .toMatchObject([
        { id: "active-player", messages: 5, voiceSeconds: 3_600 },
        { id: "old-player", name: "Idle player", messages: 0, voiceSeconds: 0 },
      ]);
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

  it("waits for the next scheduled time after a channel schedule is saved", () => {
    const weekly = { channelId: "123456789012345678", frequency: "weekly" as const, time: "09:00", timeZone: "Asia/Manila", enabledAt: "2026-10-08T04:00:00Z" };
    expect(reportDue(new Date("2026-10-08T04:01:00Z"), weekly)).toBeNull();
    expect(reportDue(new Date("2026-10-12T00:59:00Z"), weekly)).toBeNull();
    expect(reportDue(new Date("2026-10-12T01:00:00Z"), weekly)).toEqual({ key: "weekly:2026-10-12", end: "2026-10-11", days: 7 });
    const daily = { ...weekly, frequency: "daily" as const };
    expect(reportDue(new Date("2026-10-08T04:01:00Z"), daily)).toBeNull();
    expect(reportDue(new Date("2026-10-09T01:00:00Z"), daily)).toEqual({ key: "daily:2026-10-09", end: "2026-10-08", days: 1 });
  });
});
