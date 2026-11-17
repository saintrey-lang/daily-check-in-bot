import { describe, expect, it } from "vitest";
import { buildChannelChecklist, CHECKLIST_CHANNELS } from "../lib/stats/channel-checklist";
import { type StatDelta } from "../lib/stats/core";

const [admin, general, checkin] = CHECKLIST_CHANNELS;
const plan = { from: "2026-09-01", until: "2026-10-08" };
const progress = CHECKLIST_CHANNELS.map(({ id, name }) => ({
  channelId: id, channelName: name, before: "", coveredAfter: "2026-08-31", status: "complete" as const, error: "",
}));
const row = (id: string, date: string, messages: number, source: string): StatDelta => ({
  id: `${source}:${id}:${date}`, date, userId: "member", displayName: "Member", channelId: id,
  channelName: id === admin.id ? "admin-tour" : id === general.id ? "general-discussion" : "anniversary-checkin",
  messages, voiceSeconds: 0, recordedAt: `${date}T12:00:00Z`,
});

describe("channel checklist", () => {
  it("uses imported history instead of overlapping live counts and groups the selected Monday–Sunday week", () => {
    const checklist = buildChannelChecklist(
      [row(admin.id, "2026-09-02", 2, "live"), row(checkin.id, "2026-09-06", 4, "live")],
      [row(admin.id, "2026-09-02", 8, "history"), row(admin.id, "2026-09-06", 3, "history"),
        row(general.id, "2026-09-02", 7, "history"), row(checkin.id, "2026-09-06", 4, "history")],
      progress, plan, "2026-09-02", "2026-11-17", "Asia/Manila",
    );
    expect(checklist).toMatchObject({ selectedDate: "2026-09-02", weekStart: "2026-08-31", weekEnd: "2026-09-06" });
    expect(checklist.channels).toHaveLength(3);
    expect(checklist.channels[0].selectedDay).toMatchObject({ messages: 8, coverage: "imported", complete: true });
    expect(checklist.channels[0].week).toEqual({ messages: 11, complete: false });
    expect(checklist.channels[0].days[0]).toMatchObject({ date: "2026-08-31", coverage: "unavailable", complete: false });
    expect(checklist.channels[1].selectedDay.messages).toBe(7);
    expect(checklist.channels[2].week.messages).toBe(4);
  });

  it("shows incomplete old channel days as partial and caps the current week at today", () => {
    const incomplete = progress.map((item, index) => index === 0 ? { ...item, coveredAfter: "2026-09-03", status: "running" as const } : item);
    const old = buildChannelChecklist(
      [row(admin.id, "2026-09-02", 3, "live")], [], incomplete, plan,
      "2026-09-02", "2026-11-17", "Asia/Manila",
    );
    expect(old.channels[0].selectedDay).toMatchObject({ messages: 3, coverage: "importing", complete: false });
    expect(old.channels[0].week).toEqual({ messages: 3, complete: false });

    const current = buildChannelChecklist(
      [row(admin.id, "2026-11-16", 5, "live"), row(admin.id, "2026-11-17", 2, "today")],
      [], progress, plan, "2026-11-17", "2026-11-17", "Asia/Manila",
    );
    expect(current).toMatchObject({ weekStart: "2026-11-16", weekEnd: "2026-11-17" });
    expect(current.channels[0].selectedDay).toMatchObject({ messages: 2, coverage: "tracked", complete: true });
    expect(current.channels[0].week).toEqual({ messages: 7, complete: true });
    expect(current.channels[0].days[2]).toMatchObject({ coverage: "upcoming", complete: false });
  });

  it("marks the import cutoff day partial even when live messages exist", () => {
    const result = buildChannelChecklist([row(admin.id, "2026-10-08", 4, "live")], [], progress, plan,
      "2026-10-08", "2026-11-17", "Asia/Manila");
    expect(result.channels[0].selectedDay).toMatchObject({ messages: 4, coverage: "partial", complete: false });
    expect(result.channels[0].week).toMatchObject({ complete: false });
  });
});
