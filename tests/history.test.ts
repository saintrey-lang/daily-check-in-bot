import { describe, expect, it } from "vitest";
import { dateBoundarySnowflake, importChannelHistory } from "../checkin-worker/history";
import { statsSummaryRange, type HistoryProgress, type StatDelta } from "../lib/stats/core";

const day = (id: string, date: string, author: string) => ({
  id, createdAt: new Date(`${date}T10:00:00Z`), createdTimestamp: Date.parse(`${date}T10:00:00Z`),
  author: { id: author, username: author, bot: author === "bot" }, globalName: null, webhookId: null,
  member: { displayName: author, roles: { cache: [{ id: "role-1" }] } },
});

describe("server history import", () => {
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
