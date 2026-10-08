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
  it("reads staff activity, the role roster and pins in one batched request", async () => {
    const store = new StatsSheetsStore("test-spreadsheet");
    const request = vi.fn(async (_path: string, _method: string) => ({ valueRanges: [
      { values: [["live", "2026-10-09", "111111111111111111", "Alice", "channel", "general", 4, 0, "2026-10-09T01:00:00Z", "1294024616968323072", "FALSE"]] },
      { values: [] }, { values: [] }, { values: [["historyPlan", JSON.stringify({ from: "2024-10-09", until: "2026-10-08" })]] },
      { values: [["111111111111111111", "Alice", "1294024616968323072", "2026-10-08"]] },
      { values: [["roles", JSON.stringify([{ id: "1294024616968323072", name: "Admin" }])]] },
      { values: [["staffPins", JSON.stringify(["111111111111111111"])], ["staffRosterState", JSON.stringify({ status: "complete", syncedAt: "2026-10-09T00:00:00Z" })]] },
    ] }));
    Object.assign(store, { request });
    const snapshot = await store.readStaffSnapshot();
    expect(request).toHaveBeenCalledOnce();
    const path = request.mock.calls[0][0] as string;
    expect(new URL(`https://sheets.googleapis.com${path}`).searchParams.getAll("ranges")).toHaveLength(7);
    expect(snapshot).toMatchObject({ live: [{ messages: 4 }], roster: [{ name: "Alice", firstSeen: "2026-10-08" }],
      pins: ["111111111111111111"], rosterState: { status: "complete" }, roles: [{ name: "Admin" }] });
  });

  it("clears roster rows for members who lost both staff roles", async () => {
    const store = new StatsSheetsStore("test-spreadsheet");
    const request = vi.fn(async (_path: string, method: string, _data?: unknown) => method === "GET" ?
      { values: [["one"], ["two"]] } : {});
    Object.assign(store, { request });
    await store.saveStaffRoster([{ id: "111111111111111111", name: "Alice", roleIds: ["1294024616968323072"], firstSeen: "2026-10-08" }]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toContain("ServerStatsStaffRoster!A2%3AD3");
    expect(request.mock.calls[1][1]).toBe("PUT");
    expect(request.mock.calls[1][2]).toMatchObject({ values: [
      ["111111111111111111", "Alice", "1294024616968323072", "2026-10-08"], ["", "", "", ""],
    ] });
  });
});
