import { randomUUID } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { DEFAULT_PROMPT, DEFAULT_RESET_TIME, OLD_DEFAULT_PROMPT, defaultConfig, validateConfig, type CheckinAsset, type CheckinConfig, type CheckinRecord, type CheckinWindow } from "./core";
import type { PromptRecord } from "./service";

export const CHECKIN_HEADERS = [
  "Event ID", "Day", "Window Date", "Checked In At (UTC)", "Discord ID", "Discord Username",
  "Discord Display Name", "Code", "Streak", "Milestone", "Discord Message ID", "Channel ID",
];
export const PROMPT_HEADERS = ["Event ID", "Day", "Window Date", "Prompt Message ID", "Sent At (UTC)", "Revision"];
export const CONFIG_HEADERS = ["Key", "JSON"];
export const ASSET_HEADERS = ["Asset ID", "Filename", "Content Type", "Chunk", "Base64 Data", "Uploaded At (UTC)"];
const MAX_FILE_BYTES = 1024 * 1024;
const CHUNK_SIZE = 25_000;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif",
  "image/webp": ".webp", "application/pdf": ".pdf",
};

type Values = { values?: unknown[][] };
type Metadata = { sheets?: Array<{ properties?: { title?: string; sheetId?: number } }> };

function credentials() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) throw new Error("Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.");
  return { client_email: clientEmail, private_key: privateKey };
}

export function validateUpload(name: string, mime: string, bytes: Buffer): { name: string; mime: string } {
  const extension = MIME_EXTENSIONS[mime];
  if (!extension) throw new Error("Attach a PNG, JPG, GIF, WebP, or PDF file.");
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error("Each attachment must be 1 MB or smaller.");
  const valid =
    (mime === "image/png" && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) ||
    (mime === "image/jpeg" && bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) ||
    (mime === "image/gif" && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) ||
    (mime === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") ||
    (mime === "application/pdf" && bytes.toString("ascii", 0, 5) === "%PDF-");
  if (!valid) throw new Error("The file content does not match its type.");
  const base = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 55) || "checkin-file";
  return { name: `${base}${extension}`, mime };
}

export class CheckinSheetsStore {
  private readonly auth: GoogleAuth;
  private configCache: { value: CheckinConfig; until: number } | null = null;
  private readonly checkinsCache = new Map<string, { value: CheckinRecord[]; until: number }>();
  private readonly promptCache = new Map<string, { value: PromptRecord | null; until: number }>();
  constructor(private readonly sheetId: string) {
    this.auth = new GoogleAuth({ credentials: credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  }

  private async request<T>(path: string, method: "GET" | "POST" | "PUT", data?: unknown): Promise<T> {
    const client = await this.auth.getClient();
    const response = await client.request<T>({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}${path}`, method, data,
    });
    return response.data;
  }

  private async values(range: string): Promise<unknown[][]> {
    return (await this.request<Values>(`/values/${encodeURIComponent(range)}`, "GET")).values ?? [];
  }
  private async put(range: string, rows: unknown[][]): Promise<void> {
    await this.request(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, "PUT", { range, majorDimension: "ROWS", values: rows });
  }
  private async append(range: string, rows: unknown[][]): Promise<void> {
    await this.request(`/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", {
      range, majorDimension: "ROWS", values: rows,
    });
  }

  async setup(): Promise<void> {
    const headers = [
      ["Checkins", CHECKIN_HEADERS, "L"], ["CheckinPrompts", PROMPT_HEADERS, "F"],
      ["CheckinConfig", CONFIG_HEADERS, "B"], ["CheckinAssets", ASSET_HEADERS, "F"],
    ] as const;
    const metadata = await this.request<Metadata>("?fields=sheets.properties", "GET");
    const existing = new Set((metadata.sheets ?? []).map((sheet) => sheet.properties?.title));
    const missing = headers.filter(([name]) => !existing.has(name));
    if (missing.length) await this.request(":batchUpdate", "POST", { requests: missing.map(([title]) => ({ addSheet: { properties: { title } } })) });
    const updated = missing.length ? await this.request<Metadata>("?fields=sheets.properties", "GET") : metadata;
    for (const [name, columns, last] of headers) {
      const saved = (await this.values(`${name}!A1:${last}1`))[0]?.map(String) ?? [];
      if (name === "CheckinPrompts" && saved.length === 5 && JSON.stringify(saved) === JSON.stringify(PROMPT_HEADERS.slice(0, 5))) {
        await this.put("CheckinPrompts!F1", [["Revision"]]);
      } else if (saved.length && JSON.stringify(saved) !== JSON.stringify(columns)) {
        throw new Error(`${name} has unexpected headers. Restore its headers before running the bot.`);
      } else if (!saved.length) {
        if ((await this.values(`${name}!A2:A2`)).length) throw new Error(`${name} has data below a missing header.`);
        await this.put(`${name}!A1:${last}1`, [columns]);
      }
      if (missing.some(([title]) => title === name)) {
        const sheetId = updated.sheets?.find((sheet) => sheet.properties?.title === name)?.properties?.sheetId;
        if (sheetId === undefined) throw new Error(`Could not find newly created ${name} tab.`);
        await this.request(":batchUpdate", "POST", { requests: [
          { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
          { repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { backgroundColor: { red: .32, green: .26, blue: .75 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } },
            fields: "userEnteredFormat(backgroundColor,textFormat)",
          } },
        ] });
      }
    }
  }

  async readConfig(): Promise<CheckinConfig> {
    if (this.configCache && Date.now() < this.configCache.until) return this.configCache.value;
    const fallback = defaultConfig({ ...process.env, CHECKIN_GOOGLE_SHEET_ID: this.sheetId });
    const row = (await this.values("CheckinConfig!A2:B2"))[0];
    if (!row?.[1]) {
      this.configCache = { value: fallback, until: Date.now() + 15_000 };
      return fallback;
    }
    const parsed = JSON.parse(String(row[1])) as CheckinConfig;
    if (parsed.sheetId !== this.sheetId) throw new Error("The dashboard and worker use different Google Sheets.");
    if (process.env.CHECKIN_GUILD_ID?.trim()) parsed.guildId = fallback.guildId;
    // Older events have an 8 AM reset and no schedule saved in their config.
    parsed.resetTime ??= DEFAULT_RESET_TIME;
    parsed.resetSchedule ??= parsed.startDate ? [{ date: parsed.startDate, time: parsed.resetTime }] : [];
    if (parsed.prompt.description === OLD_DEFAULT_PROMPT) parsed.prompt.description = DEFAULT_PROMPT;
    validateConfig(parsed);
    this.configCache = { value: parsed, until: Date.now() + 15_000 };
    return parsed;
  }

  async saveConfig(config: CheckinConfig): Promise<void> {
    if (config.sheetId !== this.sheetId) throw new Error("Cannot change the Google Sheet from the dashboard.");
    validateConfig(config);
    await this.put("CheckinConfig!A2:B2", [["settings", JSON.stringify(config)]]);
    this.configCache = { value: config, until: Date.now() + 15_000 };
  }

  async readCheckins(eventId: string): Promise<CheckinRecord[]> {
    const cached = this.checkinsCache.get(eventId);
    if (cached && Date.now() < cached.until) return cached.value;
    const rows = await this.values("Checkins!A2:L");
    const records = rows.filter((row) => String(row[0] ?? "") === eventId).map((row) => ({
      eventId: String(row[0]), day: Number(row[1]), date: String(row[2] ?? ""),
      checkedInAt: String(row[3] ?? ""), discordId: String(row[4] ?? ""),
      username: String(row[5] ?? ""), displayName: String(row[6] ?? ""), code: String(row[7] ?? ""),
      streak: Number(row[8]), milestone: Number(row[9]) || null,
      messageId: String(row[10] ?? ""), channelId: String(row[11] ?? ""),
    }));
    this.checkinsCache.set(eventId, { value: records, until: Date.now() + 5_000 });
    return records;
  }

  async appendCheckin(row: CheckinRecord): Promise<void> {
    await this.append("Checkins!A:L", [[
      row.eventId, row.day, row.date, row.checkedInAt, row.discordId, row.username,
      row.displayName, row.code, row.streak, row.milestone ?? "", row.messageId, row.channelId,
    ]]);
    const cached = this.checkinsCache.get(row.eventId);
    if (cached) cached.value.push(row);
  }

  async getPrompt(eventId: string, day: number): Promise<PromptRecord | null> {
    const key = `${eventId}:${day}`;
    const cached = this.promptCache.get(key);
    if (cached && Date.now() < cached.until) return cached.value;
    const rows = await this.values("CheckinPrompts!A2:F");
    const found = rows.find((row) => String(row[0] ?? "") === eventId && Number(row[1]) === day);
    const prompt = found ? { messageId: String(found[3]), revision: String(found[5] ?? "") } : null;
    this.promptCache.set(key, { value: prompt, until: Date.now() + (prompt ? 30_000 : 2_000) });
    return prompt;
  }

  async appendPrompt(eventId: string, window: CheckinWindow, messageId: string, revision: string): Promise<void> {
    await this.append("CheckinPrompts!A:F", [[eventId, window.day, window.date, messageId, new Date().toISOString(), revision]]);
    this.promptCache.set(`${eventId}:${window.day}`, { value: { messageId, revision }, until: Date.now() + 30_000 });
  }

  async setPromptRevision(eventId: string, day: number, revision: string): Promise<void> {
    const rows = await this.values("CheckinPrompts!A2:F");
    const index = rows.findIndex((row) => String(row[0] ?? "") === eventId && Number(row[1]) === day);
    if (index < 0) throw new Error("Could not find the current daily prompt.");
    await this.put(`CheckinPrompts!F${index + 2}`, [[revision]]);
    const key = `${eventId}:${day}`;
    const cached = this.promptCache.get(key);
    if (cached?.value) this.promptCache.set(key, { value: { ...cached.value, revision }, until: Date.now() + 30_000 });
    else this.promptCache.delete(key);
  }

  async saveAsset(filename: string, mime: string, bytes: Buffer): Promise<{ id: string; name: string }> {
    const safe = validateUpload(filename, mime, bytes);
    const id = randomUUID();
    const base64 = bytes.toString("base64");
    const chunks = base64.match(new RegExp(`.{1,${CHUNK_SIZE}}`, "g")) ?? [];
    await this.append("CheckinAssets!A:F", chunks.map((chunk, index) => [id, safe.name, mime, index, chunk, new Date().toISOString()]));
    return { id, name: safe.name };
  }

  async readAsset(id: string | null): Promise<CheckinAsset | null> {
    if (!id) return null;
    const rows = (await this.values("CheckinAssets!A2:F")).filter((row) => String(row[0]) === id);
    if (!rows.length) throw new Error("The selected attachment is missing from the Sheet.");
    rows.sort((a, b) => Number(a[3]) - Number(b[3]));
    if (rows.some((row, index) => Number(row[3]) !== index)) throw new Error("The attachment is incomplete.");
    const bytes = Buffer.from(rows.map((row) => String(row[4])).join(""), "base64");
    const safe = validateUpload(String(rows[0][1]), String(rows[0][2]), bytes);
    return { id, name: safe.name, mime: safe.mime, bytes };
  }
}
