import { GoogleAuth } from "google-auth-library";
import { validStatsDate, validateStatsConfig, type HistoryPlan, type HistoryProgress, type StatDelta, type StatsConfig, type StatsRole } from "./core";
import { type RosterState, type StaffMember } from "../staff/core";

export const STATS_HEADERS = ["Row ID", "Date", "Discord User ID", "Display Name", "Channel ID", "Channel Name", "Messages", "Voice Seconds", "Recorded At (UTC)", "Role IDs", "Is Bot"];
const SETTINGS_HEADERS = ["Key", "Value"];
const HISTORY_HEADERS = ["Channel ID", "Channel Name", "Before Message ID", "Covered After", "Status", "Error"];
const STAFF_HEADERS = ["Discord User ID", "Display Name", "Staff Role IDs", "First Seen Date"];
type Metadata = { sheets?: Array<{ properties?: { title?: string } }> };
type Values = { values?: unknown[][] };
type BatchValues = { valueRanges?: Values[] };

export type StatsDashboardSnapshot = {
  rows: StatDelta[]; history: StatDelta[]; progress: HistoryProgress[]; plan: HistoryPlan | null;
  roles: StatsRole[]; config: StatsConfig; lastReport: string;
};
export type StaffSnapshot = {
  live: StatDelta[]; history: StatDelta[]; progress: HistoryProgress[]; plan: HistoryPlan | null;
  roster: StaffMember[]; pins: string[]; rosterState: RosterState; roles: StatsRole[];
};

function parseProgress(rows: unknown[][]): HistoryProgress[] {
  return rows.flatMap((row) => !row[0] ? [] : [{
    channelId: String(row[0]), channelName: String(row[1] ?? ""), before: String(row[2] ?? ""),
    coveredAfter: String(row[3] ?? ""), status: String(row[4] ?? "pending") as HistoryProgress["status"], error: String(row[5] ?? ""),
  }]);
}

function parseStaffRoster(rows: unknown[][]): StaffMember[] {
  return rows.flatMap((row) => !/^\d{17,20}$/.test(String(row[0] ?? "")) || !validStatsDate(String(row[3] ?? "")) ? [] : [{
    id: String(row[0]), name: String(row[1] ?? row[0]),
    roleIds: String(row[2] ?? "").split(",").filter(Boolean), firstSeen: String(row[3] ?? ""),
  }]);
}

function parseStatsRows(rows: unknown[][]): StatDelta[] {
  return rows.flatMap((row) => !row[0] ? [] : [{
    id: String(row[0]), date: String(row[1] ?? ""), userId: String(row[2] ?? ""), displayName: String(row[3] ?? ""),
    channelId: String(row[4] ?? ""), channelName: String(row[5] ?? ""), messages: Number(row[6]) || 0,
    voiceSeconds: Number(row[7]) || 0, recordedAt: String(row[8] ?? ""),
    roleIds: String(row[9] ?? "").split(",").filter(Boolean), isBot: String(row[10] ?? "") === "TRUE",
  }]);
}

function serializeStatsRows(rows: StatDelta[]): unknown[][] {
  return rows.map((row) => [row.id, row.date, row.userId, row.displayName, row.channelId, row.channelName,
    row.messages, row.voiceSeconds, row.recordedAt, (row.roleIds ?? []).join(","), row.isBot ? "TRUE" : "FALSE"]);
}

export class StatsSheetsStore {
  private readonly auth: GoogleAuth;
  private readonly progressRows = new Map<string, number>();
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
    const specs = [["ServerStats", STATS_HEADERS, "K"], ["ServerStatsHistory", STATS_HEADERS, "K"],
      ["ServerStatsConfig", SETTINGS_HEADERS, "B"], ["ServerStatsHistoryState", HISTORY_HEADERS, "F"],
      ["ServerStatsStaffRoster", STAFF_HEADERS, "D"]] as const;
    const missing = specs.filter(([name]) => !metadata.sheets?.some((sheet) => sheet.properties?.title === name));
    if (missing.length) await this.request(":batchUpdate", "POST", { requests: missing.map(([title]) => ({ addSheet: { properties: { title } } })) });
    for (const [title, columns, last] of specs) {
      const saved = (await this.values(`${title}!A1:${last}1`))[0]?.map(String) ?? [];
      if (title === "ServerStats" && saved.length === 9 && JSON.stringify(saved) === JSON.stringify(STATS_HEADERS.slice(0, 9))) {
        await this.put("ServerStats!J1:K1", [STATS_HEADERS.slice(9)]);
        continue;
      }
      if (saved.length && JSON.stringify(saved) !== JSON.stringify(columns)) throw new Error(`${title} has unexpected headers.`);
      if (!saved.length) {
        if ((await this.values(`${title}!A2:A2`)).length) throw new Error(`${title} has data below a missing header.`);
        await this.put(`${title}!A1:${last}1`, [columns]);
      }
    }
  }

  async append(rows: StatDelta[]): Promise<void> {
    if (!rows.length) return;
    await this.request(`/values/${encodeURIComponent("ServerStats!A:K")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", {
      range: "ServerStats!A:K", majorDimension: "ROWS", values: serializeStatsRows(rows),
    });
  }

  async readRows(): Promise<StatDelta[]> {
    return parseStatsRows(await this.values("ServerStats!A2:K"));
  }

  /** One Sheets read for a dashboard refresh instead of seven separate quota hits. */
  async readDashboardSnapshot(): Promise<StatsDashboardSnapshot> {
    const ranges = ["ServerStats!A2:K", "ServerStatsHistory!A2:K", "ServerStatsHistoryState!A2:F",
      "ServerStatsConfig!A4:B4", "ServerStatsConfig!A5:B5", "ServerStatsConfig!A2:B2", "ServerStatsConfig!A3:B3"];
    const params = new URLSearchParams();
    for (const range of ranges) params.append("ranges", range);
    const result = await this.request<BatchValues>(`/values:batchGet?${params}`, "GET");
    const at = (index: number) => result.valueRanges?.[index]?.values ?? [];
    const progressRows = at(2);
    this.progressRows.clear();
    progressRows.forEach((row, index) => { if (row[0]) this.progressRows.set(String(row[0]), index + 2); });
    const progress = parseProgress(progressRows);
    const planRow = at(3)[0];
    const rolesRow = at(4)[0];
    const configRow = at(5)[0];
    const lastReportRow = at(6)[0];
    const fallback = { channelId: "", frequency: "weekly", time: "09:00", timeZone: process.env.CHECKIN_TIMEZONE?.trim() || "Asia/Manila" } as const;
    return {
      rows: parseStatsRows(at(0)), history: parseStatsRows(at(1)), progress,
      plan: planRow?.[0] === "historyPlan" && planRow[1] ? JSON.parse(String(planRow[1])) as HistoryPlan : null,
      roles: rolesRow?.[0] === "roles" && rolesRow[1] ? JSON.parse(String(rolesRow[1])) as StatsRole[] : [],
      config: validateStatsConfig(configRow?.[0] === "settings" && configRow[1] ?
        { ...fallback, ...JSON.parse(String(configRow[1])) } : { ...fallback }),
      lastReport: lastReportRow?.[0] === "lastReport" ? String(lastReportRow[1] ?? "") : "",
    };
  }

  async readStaffSnapshot(): Promise<StaffSnapshot> {
    const ranges = ["ServerStats!A2:K", "ServerStatsHistory!A2:K", "ServerStatsHistoryState!A2:F",
      "ServerStatsConfig!A4:B4", "ServerStatsStaffRoster!A2:D", "ServerStatsConfig!A5:B5", "ServerStatsConfig!A6:B7"];
    const params = new URLSearchParams();
    for (const range of ranges) params.append("ranges", range);
    const result = await this.request<BatchValues>(`/values:batchGet?${params}`, "GET");
    const at = (index: number) => result.valueRanges?.[index]?.values ?? [];
    const planRow = at(3)[0];
    const rolesRow = at(5)[0];
    const configRows = at(6);
    const pinsRow = configRows.find((row) => row[0] === "staffPins");
    const stateRow = configRows.find((row) => row[0] === "staffRosterState");
    return {
      live: parseStatsRows(at(0)), history: parseStatsRows(at(1)), progress: parseProgress(at(2)),
      plan: planRow?.[0] === "historyPlan" && planRow[1] ? JSON.parse(String(planRow[1])) as HistoryPlan : null,
      roster: parseStaffRoster(at(4)),
      roles: rolesRow?.[0] === "roles" && rolesRow[1] ? JSON.parse(String(rolesRow[1])) as StatsRole[] : [],
      pins: pinsRow?.[1] ? JSON.parse(String(pinsRow[1])) as string[] : [],
      rosterState: stateRow?.[1] ? JSON.parse(String(stateRow[1])) as RosterState : { status: "pending", syncedAt: "" },
    };
  }

  async readStaffRoster(): Promise<StaffMember[]> { return parseStaffRoster(await this.values("ServerStatsStaffRoster!A2:D")); }

  async saveStaffRoster(members: StaffMember[]): Promise<void> {
    const previous = await this.values("ServerStatsStaffRoster!A2:A");
    const size = Math.max(previous.length, members.length);
    if (!size) return;
    const rows = members.map((member) => [member.id, member.name, member.roleIds.join(","), member.firstSeen]);
    while (rows.length < size) rows.push(["", "", "", ""]);
    await this.put(`ServerStatsStaffRoster!A2:D${size + 1}`, rows);
  }

  async saveStaffPins(pins: string[]): Promise<void> { await this.put("ServerStatsConfig!A6:B6", [["staffPins", JSON.stringify(pins)]]); }
  async saveRosterState(state: RosterState): Promise<void> {
    await this.put("ServerStatsConfig!A7:B7", [["staffRosterState", JSON.stringify(state)]]);
  }

  async appendHistory(rows: StatDelta[]): Promise<void> {
    // Google Sheets accepts bounded batches; retries use stable IDs and are deduplicated when read.
    for (let offset = 0; offset < rows.length; offset += 400) {
      await this.request(`/values/${encodeURIComponent("ServerStatsHistory!A:K")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", {
        range: "ServerStatsHistory!A:K", majorDimension: "ROWS", values: serializeStatsRows(rows.slice(offset, offset + 400)),
      });
    }
  }

  async readHistory(): Promise<StatDelta[]> { return parseStatsRows(await this.values("ServerStatsHistory!A2:K")); }

  async readHistoryPlan(): Promise<HistoryPlan | null> {
    const row = (await this.values("ServerStatsConfig!A4:B4"))[0];
    return row?.[0] === "historyPlan" && row[1] ? JSON.parse(String(row[1])) as HistoryPlan : null;
  }

  async saveHistoryPlan(plan: HistoryPlan): Promise<void> {
    await this.put("ServerStatsConfig!A4:B4", [["historyPlan", JSON.stringify(plan)]]);
  }

  async readRoles(): Promise<StatsRole[]> {
    const row = (await this.values("ServerStatsConfig!A5:B5"))[0];
    return row?.[0] === "roles" && row[1] ? JSON.parse(String(row[1])) as StatsRole[] : [];
  }

  async saveRoles(roles: StatsRole[]): Promise<void> {
    await this.put("ServerStatsConfig!A5:B5", [["roles", JSON.stringify(roles)]]);
  }

  async readHistoryProgress(): Promise<HistoryProgress[]> {
    const rows = await this.values("ServerStatsHistoryState!A2:F");
    this.progressRows.clear();
    rows.forEach((row, index) => { if (row[0]) this.progressRows.set(String(row[0]), index + 2); });
    return parseProgress(rows);
  }

  async addHistoryChannels(channels: HistoryProgress[]): Promise<void> {
    if (!channels.length) return;
    const nextRow = Math.max(1, ...this.progressRows.values()) + 1;
    await this.request(`/values/${encodeURIComponent("ServerStatsHistoryState!A:F")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", {
      range: "ServerStatsHistoryState!A:F", majorDimension: "ROWS",
      values: channels.map((channel) => [channel.channelId, channel.channelName, channel.before, channel.coveredAfter, channel.status, channel.error]),
    });
    channels.forEach((channel, index) => this.progressRows.set(channel.channelId, nextRow + index));
  }

  async saveHistoryProgress(channel: HistoryProgress): Promise<void> {
    let index = this.progressRows.get(channel.channelId);
    if (!index) { await this.readHistoryProgress(); index = this.progressRows.get(channel.channelId); }
    if (!index) throw new Error(`Missing history progress for channel ${channel.channelId}`);
    await this.put(`ServerStatsHistoryState!A${index}:F${index}`, [[
      channel.channelId, channel.channelName, channel.before, channel.coveredAfter, channel.status, channel.error,
    ]]);
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
