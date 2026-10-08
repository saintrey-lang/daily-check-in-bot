import { describe, expect, it, vi } from "vitest";
import { StatsSheetsStore } from "../lib/stats/sheets";

process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@example.iam.gserviceaccount.com";
process.env.GOOGLE_PRIVATE_KEY = "test-private-key";

describe("statistics dashboard Sheet read", () => {
  it("fetches the seven dashboard ranges in one request and preserves their values", async () => {
    const store = new StatsSheetsStore("test-spreadsheet");
    const request = vi.fn(async (_path: string, _method: string) => ({ valueRanges: [
      { values: [["live-1", "2026-10-08", "user-1", "Player", "channel-1", "general", 2, 0, "2026-10-08T01:00:00Z", "role-1", "FALSE"]] },
      { values: [["history-1", "2026-09-01", "user-1", "Player", "channel-1", "general", 3, 0, "2026-09-01T01:00:00Z", "role-1", "FALSE"]] },
      { values: [["channel-1", "general", "123", "2026-08-31", "running", ""]] },
      { values: [["historyPlan", JSON.stringify({ from: "2024-10-09", until: "2026-10-08" })]] },
      { values: [["roles", JSON.stringify([{ id: "role-1", name: "Players" }])]] },
      { values: [["settings", JSON.stringify({ channelId: "", frequency: "daily", time: "09:00", timeZone: "Asia/Manila" })]] },
      { values: [["lastReport", "daily:2026-10-08"]] },
    ] }));
    Object.assign(store, { request });

    const snapshot = await store.readDashboardSnapshot();
    expect(request).toHaveBeenCalledOnce();
    const [path, method] = request.mock.calls[0];
    expect(method).toBe("GET");
    expect(new URL(`https://sheets.googleapis.com${path}`).searchParams.getAll("ranges")).toHaveLength(7);
    expect(snapshot).toMatchObject({
      rows: [{ userId: "user-1", messages: 2 }], history: [{ messages: 3 }],
      progress: [{ channelId: "channel-1", status: "running" }],
      plan: { from: "2024-10-09" }, roles: [{ name: "Players" }],
      config: { frequency: "daily", time: "09:00" }, lastReport: "daily:2026-10-08",
    });
  });
});
