import { GoogleAuth } from "google-auth-library";
import { STARPLAYER_SHEET_ID, categoryFor, type StarplayerSubmission } from "./core";

export const SUBMISSION_HEADERS = [
  "Submission ID", "Submitted At (UTC)", "Discord User ID", "Username", "Display Name",
  "Task Category", "Submission Link", "Attachment Name", "Discord Submission URL",
  "Discord Message ID", "Channel ID", "Server ID", "Task Date",
];
const CONFIG_HEADERS = ["Key", "Value"];

type Values = { values?: unknown[][] };
type Metadata = { sheets?: Array<{ properties?: { title?: string; sheetId?: number } }> };

export function starplayerSheetId(): string {
  const input = process.env.STARPLAYER_GOOGLE_SHEET_ID?.trim() || STARPLAYER_SHEET_ID;
  const id = input.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] || input;
  if (!/^[\w-]{20,}$/.test(id)) throw new Error("Invalid Starplayer Google Sheet ID.");
  return id;
}

export class StarplayerSheetsStore {
  private readonly auth: GoogleAuth;
  private readonly sheetId: string;

  constructor(sheetId = starplayerSheetId()) {
    this.sheetId = sheetId;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!clientEmail || !privateKey) throw new Error("Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.");
    this.auth = new GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
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
    const tabs = [["StarplayerSubmissions", SUBMISSION_HEADERS, "M"], ["StarplayerConfig", CONFIG_HEADERS, "B"]] as const;
    const metadata = await this.request<Metadata>("?fields=sheets.properties", "GET");
    const existing = new Set((metadata.sheets ?? []).map((sheet) => sheet.properties?.title));
    const missing = tabs.filter(([name]) => !existing.has(name));
    if (missing.length) await this.request(":batchUpdate", "POST", { requests: missing.map(([title]) => ({ addSheet: { properties: { title } } })) });
    for (const [name, columns, last] of tabs) {
      const saved = (await this.values(`${name}!A1:${last}1`))[0]?.map(String) ?? [];
      if (name === "StarplayerSubmissions" && saved.length === SUBMISSION_HEADERS.length - 1 &&
        JSON.stringify(saved) === JSON.stringify(SUBMISSION_HEADERS.slice(0, -1))) {
        await this.put("StarplayerSubmissions!M1", [["Task Date"]]);
        continue;
      }
      if (saved.length && JSON.stringify(saved) !== JSON.stringify(columns)) {
        throw new Error(`${name} has unexpected headers. Restore its headers before using Starplayer submissions.`);
      }
      if (!saved.length) {
        if ((await this.values(`${name}!A2:A2`)).length) throw new Error(`${name} has data below a missing header.`);
        await this.put(`${name}!A1:${last}1`, [columns]);
      }
    }
  }

  async readSubmissions(): Promise<StarplayerSubmission[]> {
    const rows = await this.values("StarplayerSubmissions!A2:M");
    return rows.flatMap((row) => {
      const category = categoryFor(String(row[5] ?? ""));
      if (!row[0] || !category) return [];
      return [{
        id: String(row[0]), submittedAt: String(row[1] ?? ""), taskDate: String(row[12] ?? ""), userId: String(row[2] ?? ""),
        username: String(row[3] ?? ""), displayName: String(row[4] ?? ""), category: category.id,
        link: String(row[6] ?? ""), attachmentName: String(row[7] ?? ""),
        messageUrl: String(row[8] ?? ""), messageId: String(row[9] ?? ""),
        channelId: String(row[10] ?? ""), guildId: String(row[11] ?? ""),
      } satisfies StarplayerSubmission];
    });
  }

  async appendSubmission(submission: StarplayerSubmission): Promise<boolean> {
    const ids = await this.values("StarplayerSubmissions!A2:A");
    if (ids.some((row) => String(row[0] ?? "") === submission.id)) return false;
    await this.append("StarplayerSubmissions!A:M", [[
      submission.id, submission.submittedAt, submission.userId, submission.username,
      submission.displayName, categoryFor(submission.category)!.label, submission.link,
      submission.attachmentName, submission.messageUrl, submission.messageId,
      submission.channelId, submission.guildId, submission.taskDate,
    ]]);
    return true;
  }

  async readMenuMessageId(): Promise<string | null> {
    const row = (await this.values("StarplayerConfig!A2:B2"))[0];
    return row?.[0] === "menuMessageId" && row[1] ? String(row[1]) : null;
  }

  async saveMenuMessageId(id: string): Promise<void> {
    await this.put("StarplayerConfig!A2:B2", [["menuMessageId", id]]);
  }
}
