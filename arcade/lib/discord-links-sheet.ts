import { GoogleAuth } from "google-auth-library";
import { EntryError } from "./players-sheet";

const TAB = "ArcadeDiscordLinks";
const HEADERS = ["Discord User ID", "Game ID", "Discord Username", "Created At (UTC)", "Last Seen At (UTC)"];
type Values = { values?: unknown[][] };
type Metadata = { sheets?: Array<{ properties?: { title?: string } }> };
type Link = { discordId: string; gameId: string; name: string; rowNumber: number };

export class DiscordLinksStore {
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

  private async setup(): Promise<void> {
    const metadata = await this.request<Metadata>("?fields=sheets.properties", "GET");
    if (!(metadata.sheets ?? []).some((sheet) => sheet.properties?.title === TAB)) {
      try {
        await this.request(":batchUpdate", "POST", { requests: [{ addSheet: { properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } } }] });
      } catch (error) {
        const updated = await this.request<Metadata>("?fields=sheets.properties", "GET");
        if (!(updated.sheets ?? []).some((sheet) => sheet.properties?.title === TAB)) throw error;
      }
    }
    const header = (await this.values(`${TAB}!A1:E1`))[0]?.map(String) ?? [];
    if (header.length && JSON.stringify(header) !== JSON.stringify(HEADERS)) throw new Error("ArcadeDiscordLinks has unexpected headers");
    if (!header.length) {
      if ((await this.values(`${TAB}!A2:A2`)).length) throw new Error("ArcadeDiscordLinks has data below a missing header");
      await this.put(`${TAB}!A1:E1`, [HEADERS]);
    }
  }

  private async links(): Promise<Link[]> {
    await this.prepare();
    return (await this.values(`${TAB}!A2:E`)).map((row, index) => ({
      discordId: String(row[0] ?? ""), gameId: String(row[1] ?? ""), name: String(row[2] ?? ""), rowNumber: index + 2,
    })).filter((link) => link.discordId && link.gameId);
  }

  async getByDiscordId(discordId: string): Promise<Link | null> {
    const matches = (await this.links()).filter((link) => link.discordId === discordId);
    if (matches.length > 1) throw new Error("A Discord account has multiple Arcade links");
    return matches[0] ?? null;
  }

  async hasGameId(gameId: string): Promise<boolean> {
    return (await this.links()).some((link) => link.gameId === gameId);
  }

  async touch(link: Link, name: string): Promise<void> {
    await this.put(`${TAB}!C${link.rowNumber}`, [[name]]);
    await this.put(`${TAB}!E${link.rowNumber}`, [[new Date().toISOString()]]);
  }

  async link(discordId: string, gameId: string, name: string): Promise<void> {
    const existing = await this.links();
    if (existing.some((link) => link.discordId === discordId)) throw new EntryError("This Discord account already has a linked Game ID. Reopen the Activity.", 409);
    if (existing.some((link) => link.gameId === gameId)) throw new EntryError("This Game ID is already linked to another Discord account.", 409);
    const now = new Date().toISOString();
    await this.request(`/values/${encodeURIComponent(`${TAB}!A:E`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", {
      range: `${TAB}!A:E`, majorDimension: "ROWS", values: [[discordId, gameId, name, now, now]],
    });
    const after = await this.links();
    if (after.filter((link) => link.discordId === discordId || link.gameId === gameId).length !== 1) {
      throw new EntryError("The Game ID was linked at the same time by another player. Contact an admin to review it.", 409);
    }
  }
}
