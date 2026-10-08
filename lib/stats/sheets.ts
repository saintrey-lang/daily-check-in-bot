import { GoogleAuth } from "google-auth-library";
import { validateStatsConfig, type StatDelta, type StatsConfig } from "./core";

export const STATS_HEADERS = ["Row ID", "Date", "Discord User ID", "Display Name", "Channel ID", "Channel Name", "Messages", "Voice Seconds", "Recorded At (UTC)"];
const SETTINGS_HEADERS = ["Key", "Value"];
type Metadata = { sheets?: Array<{ properties?: { title?: string } }> };
type Values = { values?: unknown[][] };

export class StatsSheetsStore {
  private readonly auth: GoogleAuth;
  constructor(private readonly sheetId: string) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!email || !privateKey) throw new Error("Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.");
    this.auth = new GoogleAuth({ credentials: { client_email: email, private_key: privateKey }, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  }

  private async request<T>(path: string, method: "GET" | "POST" | "PUT", data?: unknown): Promise<T> {
    const client = await this.auth.getClient();
    const result = await client.request<T>({ url: `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}${path}`, method, data });
    return result.data;
  }
  private async values(range: string): Promise<unknown[][]> {
    return (await this.request<Values>(`/values/${encodeURIComponent(range)}`, "GET")).values ?? [];
  }
  private async put(range: string, rows: unknown[][]): Promise<void> {
    await this.request(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, "PUT", { range, majorDimension: "ROWS", values: rows });
  }

  async setup(): Promise<void> {
    const metadata = await this.request<Metadata>("?fields=sheets.properties.title", "GET");
    const specs = [["ServerStats", STATS_HEADERS, "I"], ["ServerStatsConfig", SETTINGS_HEADERS, "B"]] as const;
    const missing = specs.filter(([name]) => !metadata.sheets?.some((sheet) => sheet.properties?.title === name));
    if (missing.length) await this.request(":batchUpdate", "POST", { requests: missing.map(([title]) => ({ addSheet: { properties: { title } } })) });
    for (const [title, columns, last] of specs) {
      const saved = (await this.values(`${title}!A1:${last}1`))[0]?.map(String) ?? [];
      if (saved.length && JSON.stringify(saved) !== JSON.stringify(columns)) throw new Error(`${title} has unexpected headers.`);
      if (!saved.length) {
        if ((await this.values(`${title}!A2:A2`)).length) throw new Error(`${title} has data below a missing header.`);
        await this.put(`${title}!A1:${last}1`, [columns]);
      }
    }
  }

  async append(rows: StatDelta[]): Promise<void> {
    if (!rows.length) return;
    await this.request(`/values/${encodeURIComponent("ServerStats!A:I")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", {
      range: "ServerStats!A:I", majorDimension: "ROWS",
      values: rows.map((row) => [row.id, row.date, row.userId, row.displayName, row.channelId, row.channelName, row.messages, row.voiceSeconds, row.recordedAt]),
    });
  }

  async readRows(): Promise<StatDelta[]> {
    const rows = await this.values("ServerStats!A2:I");
    return rows.flatMap((row) => !row[0] ? [] : [{
      id: String(row[0]), date: String(row[1] ?? ""), userId: String(row[2] ?? ""), displayName: String(row[3] ?? ""),
      channelId: String(row[4] ?? ""), channelName: String(row[5] ?? ""), messages: Number(row[6]) || 0,
      voiceSeconds: Number(row[7]) || 0, recordedAt: String(row[8] ?? ""),
    }]);
  }

  async readConfig(): Promise<StatsConfig> {
    const row = (await this.values("ServerStatsConfig!A2:B2"))[0];
    const fallback = { channelId: "", frequency: "weekly", time: "09:00", timeZone: process.env.CHECKIN_TIMEZONE?.trim() || "Asia/Manila" } as const;
    return validateStatsConfig(row?.[0] === "settings" && row[1] ? { ...fallback, ...JSON.parse(String(row[1])) } : { ...fallback });
  }
  async saveConfig(config: StatsConfig): Promise<void> {
    await this.put("ServerStatsConfig!A2:B2", [["settings", JSON.stringify(validateStatsConfig(config))]]);
  }
  async readLastReport(): Promise<string> {
    const row = (await this.values("ServerStatsConfig!A3:B3"))[0];
    return row?.[0] === "lastReport" ? String(row[1] ?? "") : "";
  }
  async saveLastReport(key: string): Promise<void> {
    await this.put("ServerStatsConfig!A3:B3", [["lastReport", key]]);
  }
}
