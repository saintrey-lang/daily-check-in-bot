import { describe, expect, it, vi } from "vitest";
import { defaultConfig, startEvent, type CheckinConfig } from "../lib/checkin/core";
import { POST } from "../app/api/settings/route";
import { checkinStore } from "../lib/store";

vi.mock("../lib/store", () => ({ checkinStore: vi.fn() }));

describe("dashboard code and time settings", () => {
  it("saves each daily code and schedules an active reset-time edit for tomorrow", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T00:30:00Z"));
    try {
      const original = startEvent(defaultConfig({ CHECKIN_GOOGLE_SHEET_ID: "abcdefghijklmnopqrstuvwxyz" }), new Date("2026-09-24T02:15:00Z"));
      const saveConfig = vi.fn(async (_config: CheckinConfig) => {});
      vi.mocked(checkinStore).mockReturnValue({ setup: vi.fn(async () => {}), readConfig: vi.fn(async () => original), saveConfig } as never);
      const form = new FormData();
      form.set("revision", original.revision);
      form.set("timeZone", original.timeZone);
      form.set("resetTime", "09:30");
      original.codes.forEach((code, index) => form.append("codes", index === 0 ? "launch" : code));
      for (const target of ["prompt", "success"] as const) {
        const template = original[target];
        form.set(`${target}Title`, template.title);
        form.set(`${target}Description`, template.description);
        form.set(`${target}Color`, template.color);
        form.set(`${target}Remove`, "false");
      }
      const response = await POST(new Request("https://dashboard.example.com/api/settings", {
        method: "POST", headers: { origin: "https://dashboard.example.com" }, body: form,
      }));
      expect(response.status).toBe(200);
      const saved = saveConfig.mock.calls[0][0];
      expect(saved.codes[0]).toBe("LAUNCH");
      expect(saved.resetTime).toBe("09:30");
      expect(saved.resetSchedule[0]).toEqual({ date: "2026-09-24", time: "08:00" });
      expect(saved.resetSchedule.at(-1)).toEqual({ date: "2026-09-26", time: "09:30" });
    } finally {
      vi.useRealTimers();
    }
  });
});
