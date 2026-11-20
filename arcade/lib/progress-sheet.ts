import { GoogleAuth } from "google-auth-library";
import type { Game } from "./games";
import type { GameProgress } from "./progress";

const TAB = "ArcadeProgress";
const HEADERS = ["Game ID", "Game", "Session Token", "State JSON", "Revision", "Updated At (UTC)", "Last Posted Revision", "Completed At (UTC)"];
type Values = { values?: unknown[][] };
type Metadata = { sheets?: Array<{ properties?: { title?: string } }> };

export type SavedProgress = { token: string; state: GameProgress; revision: number; lastPostedRevision: number; completed: boolean };

export class ProgressConflict extends Error {}

export class ProgressStore {
  private readonly sheetId: string;
  private readonly auth: GoogleAuth;
  private prepared = false;

  constructor() {
    const sheet = process.env.CHECKIN_GOOGLE_SHEET_ID?.trim() || "";
    this.sheetId = sheet.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] || sheet;
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!/^[\w-]{20,}$/.test(this.sheetId) || !email || !privateKey) throw new Error("Arcade sheet credentials are not configured");
    this.auth = new GoogleAuth({ credentials: { client_email: email, private_key: privateKey }, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  }

  private async request<T>(path: string, method: "GET" | "POST" | "PUT", data?: unknown): Promise<T> {
    const client = await this.auth.getClient();
    const response = await client.request<T>({ url: `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}${path}`, method, data });
    return response.data;
  }

  private async values(range: string): Promise<unknown[][]> {
    return (await this.request<Values>(`/values/${encodeURIComponent(range)}`, "GET")).values ?? [];
  }

  private async put(range: string, rows: unknown[][]): Promise<void> {
    await this.request(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, "PUT", { range, majorDimension: "ROWS", values: rows });
  }

  private async prepare(): Promise<void> {
    if (this.prepared) return;
    const metadata = await this.request<Metadata>("?fields=sheets.properties", "GET");
    if (!(metadata.sheets ?? []).some((sheet) => sheet.properties?.title === TAB)) {
      try {
        await this.request(":batchUpdate", "POST", { requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }] });
      } catch (error) {
        const updated = await this.request<Metadata>("?fields=sheets.properties", "GET");
        if (!(updated.sheets ?? []).some((sheet) => sheet.properties?.title === TAB)) throw error;
      }
    }
    const header = (await this.values(`${TAB}!A1:H1`))[0]?.map(String) ?? [];
    if (header.length && JSON.stringify(header) !== JSON.stringify(HEADERS)) throw new Error("ArcadeProgress has unexpected headers");
    if (!header.length) await this.put(`${TAB}!A1:H1`, [HEADERS]);
    this.prepared = true;
  }

  private async find(gameId: string, game: Game): Promise<{ row: unknown[]; number: number } | null> {
    const rows = await this.values(`${TAB}!A2:H`);
    const index = rows.findIndex((row) => String(row[0] || "") === gameId && row[1] === game);
    return index < 0 ? null : { row: rows[index], number: index + 2 };
  }

  async get(gameId: string, game: Game): Promise<SavedProgress | null> {
    await this.prepare();
    const found = await this.find(gameId, game);
    if (!found) return null;
    try {
      return {
        token: String(found.row[2]), state: JSON.parse(String(found.row[3])) as GameProgress,
        revision: Number(found.row[4]) || 0, lastPostedRevision: found.row[6] === undefined || found.row[6] === "" ? -1 : Number(found.row[6]),
        completed: !!found.row[7],
      };
    } catch { return null; }
  }

  async replace(gameId: string, game: Game, token: string, state: GameProgress): Promise<void> {
    await this.prepare();
    const found = await this.find(gameId, game);
    const row = [gameId, game, token, JSON.stringify(state), 0, new Date().toISOString(), -1, ""];
    if (found) await this.put(`${TAB}!A${found.number}:H${found.number}`, [row]);
    else await this.request(`/values/${encodeURIComponent(`${TAB}!A:H`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", {
      range: `${TAB}!A:H`, majorDimension: "ROWS", values: [row],
    });
  }

  async save(gameId: string, game: Game, token: string, state: GameProgress, revision: number): Promise<SavedProgress> {
    await this.prepare();
    const found = await this.find(gameId, game);
    if (!found || found.row[2] !== token || found.row[7]) throw new ProgressConflict("This game was replaced or completed.");
    const current = Number(found.row[4]) || 0;
    if (revision > current) await this.put(`${TAB}!D${found.number}:F${found.number}`, [[JSON.stringify(state), revision, new Date().toISOString()]]);
    return {
      token, state: revision >= current ? state : JSON.parse(String(found.row[3])) as GameProgress,
      revision: Math.max(current, revision), lastPostedRevision: found.row[6] === undefined || found.row[6] === "" ? -1 : Number(found.row[6]), completed: false,
    };
  }

  async markExit(gameId: string, game: Game, token: string, revision: number): Promise<void> {
    await this.prepare();
    const found = await this.find(gameId, game);
    if (!found || found.row[2] !== token || found.row[7]) return;
    await this.put(`${TAB}!G${found.number}`, [[revision]]);
  }

  async markComplete(gameId: string, game: Game, token: string): Promise<void> {
    await this.prepare();
    const found = await this.find(gameId, game);
    if (!found || found.row[2] !== token) return;
    await this.put(`${TAB}!H${found.number}`, [[new Date().toISOString()]]);
  }
}

let sharedStore: ProgressStore | undefined;
export function progressStore(): ProgressStore {
  return sharedStore ??= new ProgressStore();
}
