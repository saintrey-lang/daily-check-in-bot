import { describe, expect, it, vi } from "vitest";
import { defaultConfig, promptEmbed, startEvent, windowAt, type CheckinConfig, type CheckinRecord } from "../lib/checkin/core";
import { ensureDailyPrompt, processCheckin, type CheckinStore, type PromptRecord } from "../lib/checkin/service";

const launched = startEvent(defaultConfig({ CHECKIN_GOOGLE_SHEET_ID: "abcdefghijklmnopqrstuvwxyz" }), new Date("2026-09-24T02:15:00Z"));
const config: CheckinConfig = { ...launched, channelId: "1503972816079425706", guildId: "1293483684888055840" };

function fakeStore() {
  const records: CheckinRecord[] = [];
  const prompts = new Map<number, PromptRecord>();
  const store: CheckinStore = {
    readCheckins: vi.fn(async () => [...records]),
    appendCheckin: vi.fn(async (row) => { records.push(row); }),
    getPrompt: vi.fn(async (_eventId, day) => prompts.get(day) ?? null),
    appendPrompt: vi.fn(async (_eventId, window, messageId, revision) => { prompts.set(window.day, { messageId, revision }); }),
    setPromptRevision: vi.fn(async (_eventId, day, revision) => { prompts.get(day)!.revision = revision; }),
  };
  return { store, records, prompts };
}

function message(day: number, code = config.codes[day - 1], userId = "player-1") {
  return {
    id: `message-${day}-${userId}`, guildId: config.guildId, channelId: config.channelId,
    userId, username: "player", displayName: "Player", content: code,
    createdAt: day === 1 ? new Date("2026-09-24T02:16:00Z") : new Date(Date.UTC(2026, 8, 24 + day - 1, 0, 5)),
    isBot: false,
  };
}

describe("dashboard-controlled 15-day check-in", () => {
  it("opens Day 1 immediately on a Thursday, resets at 8 AM Manila, and ends after Day 15", () => {
    expect(windowAt(new Date("2026-09-24T02:14:59Z"), config)).toBeNull();
    expect(windowAt(new Date("2026-09-24T02:15:00Z"), config)).toEqual({ day: 1, date: "2026-09-24", code: "MONDAY" });
    expect(windowAt(new Date("2026-09-24T23:59:59Z"), config)?.day).toBe(1);
    expect(windowAt(new Date("2026-09-25T00:00:00Z"), config)?.day).toBe(2);
    expect(windowAt(new Date("2026-10-08T00:00:00Z"), config)?.day).toBe(15);
    expect(windowAt(new Date("2026-10-09T00:00:00Z"), config)).toBeNull();
  });

  it("ignores codes until the bot has posted the prompt, then accepts any letter case", async () => {
    const { store, records, prompts } = fakeStore();
    expect((await processCheckin(message(1, "monday"), config, store)).status).toBe("ignored");
    prompts.set(1, { messageId: "prompt", revision: config.revision });
    const result = await processCheckin(message(1, "mOnDaY"), config, store);
    expect(result.status).toBe("checked-in");
    expect(result.embed?.title).toBe("DAY 1 - CHECK-IN VERIFIED");
    expect(result.embed?.description).toContain("14 DAYS TO GO");
    expect(records).toHaveLength(1);
    expect((await processCheckin(message(1, "MONDAY"), config, store)).status).toBe("duplicate");
    expect(records).toHaveLength(1);
  });

  it("celebrates exactly 4, 7 and 15 straight days, and restarts a missed streak", async () => {
    const { store, records, prompts } = fakeStore();
    for (let day = 1; day <= 15; day++) {
      prompts.set(day, { messageId: String(day), revision: config.revision });
      const result = await processCheckin(message(day), config, store);
      if ([4, 7, 15].includes(day)) expect(result.embed?.fields?.[0]?.value).toContain(`${day} consecutive`);
      if (day === 15) expect(result.embed?.description).toContain("0 DAYS TO GO");
    }
    expect(records.map((row) => row.milestone).filter(Boolean)).toEqual([4, 7, 15]);
    const secondPlayer = await processCheckin(message(1, "MONDAY", "player-2"), config, store);
    const thirdDay = await processCheckin(message(3, "WEDNESDAY", "player-2"), config, store);
    expect(secondPlayer.status).toBe("checked-in");
    expect(thirdDay.status).toBe("checked-in");
    expect(records.filter((row) => row.discordId === "player-2").map((row) => row.streak)).toEqual([1, 1]);
  });

  it("never sends a verified reply when the Sheet rejects the write", async () => {
    const { store, prompts } = fakeStore();
    prompts.set(1, { messageId: "prompt", revision: config.revision });
    store.appendCheckin = vi.fn().mockRejectedValue(new Error("Sheet unavailable"));
    await expect(processCheckin(message(1), config, store)).rejects.toThrow("Sheet unavailable");
  });

  it("posts one prompt per day and edits the current prompt after a dashboard save", async () => {
    const { store } = fakeStore();
    const post = vi.fn(async () => "prompt-id");
    const update = vi.fn(async () => {});
    expect(await ensureDailyPrompt(new Date("2026-09-24T02:15:01Z"), config, store, post, update)).toBe(1);
    expect(await ensureDailyPrompt(new Date("2026-09-24T03:00:00Z"), config, store, post, update)).toBe(1);
    const revised = { ...config, revision: "new-version", prompt: { ...config.prompt, title: "NEW DAY {day}" } };
    await ensureDailyPrompt(new Date("2026-09-24T03:01:00Z"), revised, store, post, update);
    expect(post).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("prompt-id", expect.objectContaining({ title: "NEW DAY 1" }));
  });

  it("always shows the daily code even if an admin changes the prompt body", () => {
    expect(promptEmbed({ day: 1, date: "2026-09-24", code: "MONDAY" }, { ...config, prompt: { ...config.prompt, description: "Welcome!" } }).fields?.[0]).toEqual({ name: "DAILY CODE", value: "**MONDAY**" });
  });
});
