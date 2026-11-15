import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultConfig, endEvent, resetEvent, startEvent, windowAt, type CheckinConfig } from "../lib/checkin/core";
import { POST as endRun } from "../app/api/end/route";
import { POST as startRun } from "../app/api/start/route";
import { CheckinSheetsStore } from "../lib/checkin/sheets";
import { POST as saveCode } from "../app/api/code/route";
import { checkinStore } from "../lib/store";

vi.mock("../lib/store", () => ({ checkinStore: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

const sheet = "abcdefghijklmnopqrstuvwxyz";
function request(path: string, body: object): Request {
  return new Request(`https://dashboard.example.com/api/${path}`, {
    method: "POST", headers: { origin: "https://dashboard.example.com", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("daily check-in run controls", () => {
  it("ends a live run, keeps its ID for history, and permits a fresh run", async () => {
    vi.useFakeTimers();
    const started = new Date("2026-11-15T03:27:06Z");
    const now = new Date("2026-11-15T03:30:00Z");
    vi.setSystemTime(now);
    const original = startEvent(defaultConfig({ CHECKIN_GOOGLE_SHEET_ID: sheet }), started);
    const saveConfig = vi.fn(async (_config: CheckinConfig) => {});
    const getPrompt = vi.fn(async () => ({ messageId: "announcement-1", revision: original.revision }));
    vi.mocked(checkinStore).mockReturnValue({
      setup: vi.fn(async () => {}), readConfig: vi.fn(async () => original), getPrompt, saveConfig,
    } as never);

    const response = await endRun(request("end", { revision: original.revision }));
    expect(response.status).toBe(200);
    const saved = saveConfig.mock.calls[0][0];
    expect(saved.eventId).toBeNull();
    expect(saved.lastEventId).toBe(original.eventId);
    expect(saved.supersededPromptId).toBe("announcement-1");
    expect(saved.endedAt).toBe(now.toISOString());
    expect(windowAt(now, saved)).toBeNull();
    expect(startEvent(saved, new Date(now.getTime() + 1)).eventId).not.toBe(original.eventId);
  });

  it("can cancel a scheduled run before Day 1", () => {
    const draft = defaultConfig({ CHECKIN_GOOGLE_SHEET_ID: sheet });
    const now = new Date("2026-11-15T03:30:00Z");
    const scheduled = resetEvent(draft, now, "2026-11-17");
    const ended = endEvent(scheduled, now);
    expect(ended.eventId).toBeNull();
    expect(ended.lastEventId).toBe(scheduled.eventId);
    expect(startEvent(ended, new Date(now.getTime() + 1)).eventId).toBeTruthy();
  });

  it("saves the active day's code without replacing other days", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-11-16T00:30:00Z");
    vi.setSystemTime(now);
    const original = startEvent(defaultConfig({ CHECKIN_GOOGLE_SHEET_ID: sheet }), new Date("2026-11-15T03:27:06Z"));
    const saveConfig = vi.fn(async (_config: CheckinConfig) => {});
    vi.mocked(checkinStore).mockReturnValue({
      setup: vi.fn(async () => {}), readConfig: vi.fn(async () => original), saveConfig,
    } as never);

    const response = await saveCode(request("code", { revision: original.revision, day: 2, code: " new_16 " }));
    expect(response.status).toBe(200);
    const saved = saveConfig.mock.calls[0][0];
    expect(saved.codes[0]).toBe("MONDAY");
    expect(saved.codes[1]).toBe("NEW_16");
    expect(windowAt(now, saved)?.code).toBe("NEW_16");

    const wrongDay = await saveCode(request("code", { revision: original.revision, day: 1, code: "WRONG" }));
    expect(wrongDay.status).toBe(409);
    expect(saveConfig).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale end request", async () => {
    const original = startEvent(defaultConfig({ CHECKIN_GOOGLE_SHEET_ID: sheet }), new Date("2026-11-15T03:27:06Z"));
    const saveConfig = vi.fn();
    vi.mocked(checkinStore).mockReturnValue({
      setup: vi.fn(async () => {}), readConfig: vi.fn(async () => original), saveConfig,
    } as never);
    const response = await endRun(request("end", { revision: "old-revision" }));
    expect(response.status).toBe(409);
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("reads the latest Sheet config even when this process has a cached default", async () => {
    const old = defaultConfig({ CHECKIN_GOOGLE_SHEET_ID: sheet });
    const saved = { ...old, codes: ["SUNDAY", ...old.codes.slice(1)], revision: "saved-sunday" };
    const store = Object.assign(Object.create(CheckinSheetsStore.prototype), {
      sheetId: sheet,
      configCache: { value: old, until: Date.now() + 30_000 },
      values: vi.fn(async () => [["settings", JSON.stringify(saved)]]),
    }) as CheckinSheetsStore;

    expect((await store.readConfig()).codes[0]).toBe("MONDAY");
    expect((await store.readConfig({ fresh: true })).codes[0]).toBe("SUNDAY");
  });

  it("starts Day 1 with the newly saved code across server instances", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-11-15T03:30:00Z");
    vi.setSystemTime(now);
    const old = defaultConfig({ CHECKIN_GOOGLE_SHEET_ID: sheet });
    const latest = { ...old, codes: ["SUNDAY", ...old.codes.slice(1)], revision: "saved-sunday" };
    const readConfig = vi.fn(async ({ fresh = false }: { fresh?: boolean } = {}) => fresh ? latest : old);
    const saveConfig = vi.fn(async (_config: CheckinConfig) => {});
    vi.mocked(checkinStore).mockReturnValue({
      setup: vi.fn(async () => {}), readConfig, saveConfig,
    } as never);

    const response = await startRun(request("start", { revision: latest.revision }));
    expect(response.status).toBe(200);
    expect((await response.json()).code).toBe("SUNDAY");
    expect(readConfig).toHaveBeenCalledWith({ fresh: true });
    expect(saveConfig.mock.calls[0][0].codes[0]).toBe("SUNDAY");
    expect(windowAt(now, saveConfig.mock.calls[0][0])?.code).toBe("SUNDAY");

    const stale = await startRun(request("start", { revision: old.revision }));
    expect(stale.status).toBe(409);
    expect(saveConfig).toHaveBeenCalledTimes(1);
  });
});
