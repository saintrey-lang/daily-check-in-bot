import { describe, expect, it, vi } from "vitest";
import { submissionMenu, submissionModal } from "../checkin-worker/starplayer";
import { STARPLAYER_CATEGORIES, starplayerSummary, todayInManila, validateSubmission, validateTaskDate, validateTaskTitle, type StarplayerSubmission } from "../lib/starplayer/core";
import { StarplayerSheetsStore, SUBMISSION_HEADERS } from "../lib/starplayer/sheets";

process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@example.iam.gserviceaccount.com";
process.env.GOOGLE_PRIVATE_KEY = "test-private-key";

function submission(id: string, userId: string, category: StarplayerSubmission["category"]): StarplayerSubmission {
  return {
    id, submittedAt: `2026-09-24T12:00:${id.padStart(2, "0")}Z`, taskDate: "2026-09-18", taskTitle: "My task", userId,
    username: `user-${userId}`, displayName: `Player ${userId}`, category,
    link: "https://example.com/post", attachmentName: "", messageUrl: "https://discord.com/channels/1/2/3",
    messageId: "3", channelId: "2", guildId: "1",
  };
}

describe("Starplayer submissions", () => {
  it("offers four categories, a required title, a default Manila task date, and optional link and file fields", () => {
    const select = submissionMenu().toJSON().components[0];
    expect(select.options?.map((option) => option.label)).toEqual(STARPLAYER_CATEGORIES.map((category) => category.label));
    const modal = submissionModal("strategy-tips").toJSON();
    expect(modal.components).toMatchObject([
      { label: "Task Title", component: { required: true, max_length: 150 } },
      { label: "Task Date (YYYY-MM-DD)", component: { required: true, value: todayInManila() } },
      { component: { required: false } },
      { component: { type: 19, required: false, min_values: 0, max_values: 1 } },
    ]);
  });

  it("requires a concise task title", () => {
    expect(validateTaskTitle("  My strategy guide  ")).toBe("My strategy guide");
    expect(() => validateTaskTitle(" ")).toThrow("Enter a task title");
    expect(() => validateTaskTitle("a".repeat(151))).toThrow("150 characters");
  });

  it("accepts last week's task date but rejects invalid or future dates in Manila", () => {
    const now = new Date("2026-09-25T00:00:00Z");
    expect(validateTaskDate("2026-09-18", now)).toBe("2026-09-18");
    expect(todayInManila(now)).toBe("2026-09-25");
    expect(() => validateTaskDate("2026-02-30", now)).toThrow("YYYY-MM-DD");
    expect(() => validateTaskDate("2026-09-26", now)).toThrow("future");
  });

  it("accepts either a link or an attachment and rejects an empty task", () => {
    expect(validateSubmission("  https://example.com/post  ", "")).toBe("https://example.com/post");
    expect(validateSubmission("", "screenshot.png")).toBe("");
    expect(() => validateSubmission("", "")).toThrow("link or attach");
    expect(() => validateSubmission("javascript:alert(1)", "x.png")).toThrow("https://");
  });

  it("counts every submission but finishes each player-category task only once", () => {
    const summary = starplayerSummary([
      submission("1", "one", "strategy-tips"),
      submission("2", "one", "strategy-tips"),
      submission("3", "one", "engagement"),
      submission("4", "two", "version-discussion"),
      submission("5", "two", "others"),
    ]);
    expect(summary.totalSubmissions).toBe(5);
    expect(summary.uniquePlayers).toBe(2);
    expect(summary.completedTasks).toBe(4);
    expect(summary.categories.map((category) => [category.submissions, category.players])).toEqual([[2, 1], [1, 1], [1, 1], [1, 1]]);
    expect(summary.players.find((player) => player.userId === "one")?.categories).toEqual(["strategy-tips", "engagement"]);
  });

  it("records readable rows in the separate Starplayer Sheet and ignores duplicate interaction IDs", async () => {
    const store = new StarplayerSheetsStore("a".repeat(24));
    const rows: unknown[][] = [];
    const append = vi.fn(async (_range: string, newRows: unknown[][]) => { rows.push(...newRows); });
    Object.assign(store, { values: vi.fn(async () => rows.map((row) => [row[0]])), append });
    const entry = submission("1", "one", "strategy-tips");
    expect(await store.appendSubmission(entry)).toBe(true);
    expect(await store.appendSubmission(entry)).toBe(false);
    expect(append).toHaveBeenCalledTimes(1);
    expect(rows[0][5]).toBe("Strategy & Tips");
    expect(rows[0][8]).toBe(entry.messageUrl);
    expect(rows[0][12]).toBe("2026-09-18");
    expect(rows[0][13]).toBe("My task");
    expect(SUBMISSION_HEADERS).toHaveLength(14);
  });

  it("keeps other tabs and existing Starplayer data intact during setup", async () => {
    const store = new StarplayerSheetsStore("a".repeat(24));
    const request = vi.fn(async (_path: string, _method: string) => ({ sheets: [
      { properties: { title: "Existing tasks" } },
      { properties: { title: "StarplayerSubmissions" } },
      { properties: { title: "StarplayerConfig" } },
    ] }));
    Object.assign(store, {
      request,
      values: vi.fn(async (range: string) => range.startsWith("StarplayerSubmissions") ? [SUBMISSION_HEADERS] : [["Key", "Value"]]),
    });
    await store.setup();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toBe("GET");
  });

  it("adds the title header to an existing 13-column Sheet without changing historical rows", async () => {
    const store = new StarplayerSheetsStore("a".repeat(24));
    const put = vi.fn(async () => {});
    Object.assign(store, {
      request: vi.fn(async () => ({ sheets: [
        { properties: { title: "StarplayerSubmissions" } }, { properties: { title: "StarplayerConfig" } },
      ] })),
      values: vi.fn(async (range: string) => range.startsWith("StarplayerSubmissions")
        ? [SUBMISSION_HEADERS.slice(0, -1)] : [["Key", "Value"]]),
      put,
    });
    await store.setup();
    expect(put).toHaveBeenCalledExactlyOnceWith("StarplayerSubmissions!N1:N1", [["Task Title"]]);
  });

  it("upgrades an older 12-column Sheet in place", async () => {
    const store = new StarplayerSheetsStore("a".repeat(24));
    const put = vi.fn(async () => {});
    Object.assign(store, {
      request: vi.fn(async () => ({ sheets: [
        { properties: { title: "StarplayerSubmissions" } }, { properties: { title: "StarplayerConfig" } },
      ] })),
      values: vi.fn(async (range: string) => range.startsWith("StarplayerSubmissions")
        ? [SUBMISSION_HEADERS.slice(0, -2)] : [["Key", "Value"]]),
      put,
    });
    await store.setup();
    expect(put).toHaveBeenCalledExactlyOnceWith("StarplayerSubmissions!M1:N1", [["Task Date", "Task Title"]]);
  });
});
