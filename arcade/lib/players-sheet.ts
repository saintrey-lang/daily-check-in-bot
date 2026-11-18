import { GoogleAuth } from "google-auth-library";
import { checkPin, hashPin } from "./player";

const LEGACY_HEADERS = ["Game ID", "PIN Hash", "Created At (UTC)", "Last Login At (UTC)", "Failed Attempts", "Locked Until (UTC)"];
export const PLAYER_HEADERS = [...LEGACY_HEADERS, "Name"];
const TAB = "ArcadePlayers";
type Values = { values?: unknown[][] };
type Metadata = { sheets?: Array<{ properties?: { title?: string; sheetId?: number } }> };

export class EntryError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export class ArcadePlayersStore {
  private readonly sheetId: string;
  private readonly auth: GoogleAuth;
  private setupPromise: Promise<void> | null = null;

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
    if (!this.setupPromise) this.setupPromise = this.setup().catch((error) => { this.setupPromise = null; throw error; });
    await this.setupPromise;
  }

  async setup(): Promise<void> {
    const metadata = await this.request<Metadata>("?fields=sheets.properties", "GET");
    if (!(metadata.sheets ?? []).some((sheet) => sheet.properties?.title === TAB)) {
      try {
        await this.request(":batchUpdate", "POST", { requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }] });
      } catch (error) {
        const updated = await this.request<Metadata>("?fields=sheets.properties", "GET");
        if (!(updated.sheets ?? []).some((sheet) => sheet.properties?.title === TAB)) throw error;
      }
    }
    const header = (await this.values(`${TAB}!A1:G1`))[0]?.map(String) ?? [];
    if (JSON.stringify(header) === JSON.stringify(LEGACY_HEADERS)) {
      await this.put(`${TAB}!G1`, [["Name"]]);
      return;
    }
    if (header.length && JSON.stringify(header) !== JSON.stringify(PLAYER_HEADERS)) throw new Error("ArcadePlayers has unexpected headers");
    if (!header.length) {
      if ((await this.values(`${TAB}!A2:A2`)).length) throw new Error("ArcadePlayers has data below a missing header");
      await this.put(`${TAB}!A1:G1`, [PLAYER_HEADERS]);
    }
  }

  private async find(gameId: string): Promise<{ row: unknown[]; number: number } | null> {
    const rows = await this.values(`${TAB}!A2:G`);
    const index = rows.findIndex((row) => String(row[0] ?? "").toUpperCase() === gameId);
    return index < 0 ? null : { row: rows[index], number: index + 2 };
  }

  async register(gameId: string, pin: string, name: string): Promise<void> {
    await this.prepare();
    if (await this.find(gameId)) throw new EntryError("That Game ID already has a PIN. Choose Sign in instead.", 409);
    const now = new Date().toISOString();
    await this.request(`/values/${encodeURIComponent(`${TAB}!A:G`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", {
      range: `${TAB}!A:G`, majorDimension: "ROWS", values: [[gameId, hashPin(pin), now, now, 0, "", name]],
    });
  }

  async login(gameId: string, pin: string, name: string): Promise<void> {
    await this.prepare();
    const found = await this.find(gameId);
    if (!found) throw new EntryError("Game ID or PIN is incorrect.", 401);
    const lockedUntil = Date.parse(String(found.row[5] || ""));
    if (Number.isFinite(lockedUntil) && lockedUntil > Date.now()) {
      throw new EntryError("Too many incorrect PINs. Try again in 15 minutes.", 429);
    }
    if (!checkPin(pin, String(found.row[1] || ""))) {
      const attempts = (Number.isFinite(lockedUntil) && lockedUntil <= Date.now() ? 0 : Number(found.row[4]) || 0) + 1;
      const nextLock = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : "";
      await this.put(`${TAB}!E${found.number}:F${found.number}`, [[attempts, nextLock]]);
      throw new EntryError(attempts >= 5 ? "Too many incorrect PINs. Try again in 15 minutes." : "Game ID or PIN is incorrect.", attempts >= 5 ? 429 : 401);
    }
    await this.put(`${TAB}!D${found.number}:G${found.number}`, [[new Date().toISOString(), 0, "", name]]);
  }
}
