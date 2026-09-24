import { describe, expect, it, vi } from "vitest";
import { ASSET_HEADERS, CHECKIN_HEADERS, CONFIG_HEADERS, PROMPT_HEADERS, CheckinSheetsStore, validateUpload } from "../lib/checkin/sheets";

process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@example.iam.gserviceaccount.com";
process.env.GOOGLE_PRIVATE_KEY = "test-private-key";

describe("check-in Sheet", () => {
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
