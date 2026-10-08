import { describe, expect, it } from "vitest";
import { dateBoundarySnowflake, importChannelHistory, rewindCompletedHistory } from "../checkin-worker/history";
import { statsSummaryRange, type HistoryProgress, type StatDelta } from "../lib/stats/core";

const day = (id: string, date: string, author: string) => ({
  id, createdAt: new Date(`${date}T10:00:00Z`), createdTimestamp: Date.parse(`${date}T10:00:00Z`),
  author: { id: author, username: author, bot: author === "bot" }, globalName: null, webhookId: null,
  member: { displayName: author, roles: { cache: [{ id: "role-1" }] } },
});

describe("server history import", () => {
  it("extends completed channels before the previous cutoff without reopening active imports", () => {
    const completed: HistoryProgress = { channelId: "old", channelName: "old", before: "previous", coveredAfter: "2026-07-31", status: "complete", error: "" };
    const running: HistoryProgress = { ...completed, channelId: "active", status: "running", coveredAfter: "2026-09-01" };
    const rewound = rewindCompletedHistory([completed, running], "2026-08-01", "Asia/Manila");
    expect(rewound).toEqual([{ ...completed, status: "pending", before: dateBoundarySnowflake("2026-08-01", "Asia/Manila") }]);
    expect(running.status).toBe("running");
  });

  it("retains imported days and adds earlier days once a completed channel is reopened", async () => {
    const august: StatDelta = { id: "history:channel:2026-08-01:member", date: "2026-08-01", userId: "member",
      displayName: "member", channelId: "channel", channelName: "general", messages: 1, voiceSeconds: 0,
      recordedAt: "2026-08-01T10:00:00Z" };
    const rows = [august];
    const [state] = rewindCompletedHistory([{ channelId: "channel", channelName: "general", before: "", coveredAfter: "2026-07-31", status: "complete", error: "" }], "2026-08-01", "Asia/Manila");
    const earlier = day((BigInt(dateBoundarySnowflake("2026-07-31", "Asia/Manila")) + 1n).toString(), "2026-07-31", "member");
    const channel = { id: "channel", name: "general", messages: {
      fetch: async ({ before }: { before: string }) => new Map(BigInt(earlier.id) < BigInt(before) ? [[earlier.id, earlier]] : []),
    } } as unknown as Parameters<typeof importChannelHistory>[0];
    const store = {
      saveHistoryProgress: async () => {},
      appendHistory: async (added: StatDelta[]) => { rows.push(...added); },
    } as unknown as Parameters<typeof importChannelHistory>[3];
    const plan = { from: "2026-07-01", until: "2026-10-08" };
    await importChannelHistory(channel, state, plan, store, "Asia/Manila", {} as Parameters<typeof importChannelHistory>[5], new Map(), 0);
    expect(state.coveredAfter).toBe("2026-06-30");
    expect(statsSummaryRange([], "2026-07-31", "2026-08-01", { history: rows, progress: [state], plan }).messages).toBe(2);
  });
  it("resumes from completed days and keeps retries from doubling message totals", async () => {
    const messages = [day("300", "2026-10-07", "bot"), day("200", "2026-10-07", "member"), day("100", "2026-08-01", "member")];
    const writes: StatDelta[] = [];
    const channel = {
      id: "channel", name: "general",
      messages: { fetch: async ({ before }: { before: string }) => new Map(messages.filter((message) => BigInt(message.id) < BigInt(before)).map((message) => [message.id, message])) },
    } as unknown as Parameters<typeof importChannelHistory>[0];
    const state: HistoryProgress = { channelId: "channel", channelName: "general", before: dateBoundarySnowflake("2026-10-08", "Asia/Manila"), coveredAfter: "2026-10-08", status: "pending", error: "" };
    const plan = { from: "2026-08-01", until: "2026-10-08" };
    let failOnce = true;
    const store = {
      saveHistoryProgress: async () => {},
      appendHistory: async (rows: StatDelta[]) => {
        writes.push(...rows);
        if (failOnce) { failOnce = false; throw new Error("Simulated write acknowledgement loss"); }
      },
    } as unknown as Parameters<typeof importChannelHistory>[3];
    const guild = {} as Parameters<typeof importChannelHistory>[5];
    await expect(importChannelHistory(channel, state, plan, store, "Asia/Manila", guild, new Map(), 0)).rejects.toThrow("acknowledgement");
    expect(state.coveredAfter).toBe(plan.until);
    await importChannelHistory(channel, state, plan, store, "Asia/Manila", guild, new Map(), 0);
    expect(state.status).toBe("complete");
    expect(state.coveredAfter).toBe("2026-07-31");
    const summary = statsSummaryRange([], "2026-10-07", "2026-10-07", { history: writes, plan, progress: [state] });
    expect(summary.messages).toBe(2);
    expect(summary.botMessages).toBe(1);
    expect(summary.members).toHaveLength(2);
  });
});
