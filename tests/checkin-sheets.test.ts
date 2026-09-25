import { describe, expect, it, vi } from "vitest";
import { ASSET_HEADERS, CHECKIN_HEADERS, CONFIG_HEADERS, PROMPT_HEADERS, CheckinSheetsStore, validateUpload } from "../lib/checkin/sheets";
import { defaultConfig } from "../lib/checkin/core";

process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@example.iam.gserviceaccount.com";
process.env.GOOGLE_PRIVATE_KEY = "test-private-key";

describe("check-in Sheet", () => {
  it("uses the configured server when the Sheet has an older server ID", async () => {
    const sheetId = "a".repeat(24);
    const stale = defaultConfig({ CHECKIN_GOOGLE_SHEET_ID: sheetId, CHECKIN_GUILD_ID: "1293668498450419712" });
    const store = new CheckinSheetsStore(sheetId);
    Object.assign(store, { values: vi.fn(async () => [["settings", JSON.stringify(stale)]]) });
    vi.stubEnv("CHECKIN_GUILD_ID", "1293483684888055840");
    try {
      expect((await store.readConfig()).guildId).toBe("1293483684888055840");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reads a saved event from before reset time was configurable", async () => {
    const sheetId = "a".repeat(24);
    const old = defaultConfig({ CHECKIN_GOOGLE_SHEET_ID: sheetId });
    const config = { ...old, eventId: "old-event", startedAt: "2026-09-24T02:15:00Z", startDate: "2026-09-24" };
    const stored = JSON.parse(JSON.stringify(config));
    delete stored.resetTime;
    delete stored.resetSchedule;
    stored.prompt.description = "Type today's code in this channel to check in. Your next day begins at 8:00 AM ({timezone}).";
    const store = new CheckinSheetsStore(sheetId);
    Object.assign(store, { values: vi.fn(async () => [["settings", JSON.stringify(stored)]]) });
    const loaded = await store.readConfig();
    expect(loaded.resetTime).toBe("08:00");
    expect(loaded.resetSchedule).toEqual([{ date: "2026-09-24", time: "08:00" }]);
    expect(loaded.prompt.description).toContain("{resetTime}");
  });

  it("does not rewrite existing tab data or formatting at startup", async () => {
    const store = new CheckinSheetsStore("test-spreadsheet");
    const metadata = { sheets: [
      { properties: { sheetId: 10, title: "Checkins" } }, { properties: { sheetId: 11, title: "CheckinPrompts" } },
      { properties: { sheetId: 12, title: "CheckinConfig" } }, { properties: { sheetId: 13, title: "CheckinAssets" } },
    ] };
    const request = vi.fn().mockResolvedValue(metadata);
    const values = vi.fn(async (range: string) => range.startsWith("Checkins") ? [CHECKIN_HEADERS] :
      range.startsWith("CheckinPrompts") ? [PROMPT_HEADERS] :
      range.startsWith("CheckinConfig") ? [CONFIG_HEADERS] : [ASSET_HEADERS]);
    Object.assign(store, { request, values });
    await store.setup();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.every(([, method]) => method === "GET")).toBe(true);
  });

  it("keeps a just-written check-in visible in the short read cache", async () => {
    const store = new CheckinSheetsStore("test-spreadsheet");
    const values = vi.fn(async () => [] as unknown[][]);
    const append = vi.fn(async () => {});
    Object.assign(store, { values, append });
    expect(await store.readCheckins("event-one")).toEqual([]);
    const record = {
      eventId: "event-one", day: 1, date: "2026-09-25", checkedInAt: "2026-09-25T11:00:00Z",
      discordId: "123", username: "player", displayName: "Player", code: "FRIDAY", streak: 1,
      milestone: null, messageId: "456", channelId: "789",
    };
    await store.appendCheckin(record);
    expect(await store.readCheckins("event-one")).toEqual([record]);
    expect(values).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();
  });

  it("rejects oversized and disguised attachments", () => {
    expect(() => validateUpload("huge.png", "image/png", Buffer.alloc(1024 * 1024 + 1))).toThrow("1 MB");
    expect(() => validateUpload("fake.png", "image/png", Buffer.from("not an image"))).toThrow("does not match");
    expect(validateUpload("my event.pdf", "application/pdf", Buffer.from("%PDF-1.5 test")).name).toBe("my-event.pdf");
  });

  it("round-trips an uploaded image through Sheet chunks", async () => {
    const store = new CheckinSheetsStore("test-spreadsheet");
    const appended = vi.fn(async (_range: string, rows: unknown[][]) => { saved.push(...rows); });
    const saved: unknown[][] = [];
    Object.assign(store, { append: appended, values: vi.fn(async () => saved) });
    const bytes = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(32_000, 111)]);
    const { id } = await store.saveAsset("cover.png", "image/png", bytes);
    expect(appended).toHaveBeenCalledTimes(1);
    const loaded = await store.readAsset(id);
    expect(loaded?.bytes.equals(bytes)).toBe(true);
    expect(saved.length).toBeGreaterThan(1);
  });
});
