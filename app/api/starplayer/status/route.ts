import { starplayerSummary } from "@/lib/starplayer/core";
import { StarplayerSheetsStore, starplayerSheetId } from "@/lib/starplayer/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = new StarplayerSheetsStore();
    await store.setup();
    const submissions = await store.readSubmissions();
    return Response.json({
      ...starplayerSummary(submissions),
      sheetUrl: `https://docs.google.com/spreadsheets/d/${starplayerSheetId()}/edit`,
    });
  } catch (error) {
    console.error("Could not load Starplayer submissions.", error);
    return Response.json({ error: "Starplayer submissions are unavailable. Share the Starplayer Sheet with the dashboard service account as Editor." }, { status: 503 });
  }
}
