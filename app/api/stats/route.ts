import { defaultConfig, localDateAt } from "@/lib/checkin/core";
import { requireSameOrigin } from "@/lib/request";
import { statsSummary, validateStatsConfig, type StatsConfig } from "@/lib/stats/core";
import { StatsSheetsStore } from "@/lib/stats/sheets";

export const dynamic = "force-dynamic";

function store() {
  return new StatsSheetsStore(defaultConfig(process.env).sheetId);
}

export async function GET() {
  try {
    const sheet = store();
    const [rows, config, lastReport] = await Promise.all([sheet.readRows(), sheet.readConfig(), sheet.readLastReport()]);
    const today = localDateAt(new Date(), process.env.CHECKIN_TIMEZONE?.trim() || "Asia/Manila");
    return Response.json({
      seven: statsSummary(rows, today, 7), thirty: statsSummary(rows, today, 30), config, lastReport,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${defaultConfig(process.env).sheetId}/edit`,
    });
  } catch (error) {
    console.error("Could not load server statistics.", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not load server statistics." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  try {
    const body = await request.json() as Partial<StatsConfig>;
    const config = validateStatsConfig({
      channelId: String(body.channelId ?? "").trim(),
      frequency: body.frequency as StatsConfig["frequency"],
      time: String(body.time ?? "").trim(),
      timeZone: process.env.CHECKIN_TIMEZONE?.trim() || "Asia/Manila",
    });
    const sheet = store();
    await sheet.saveConfig(config);
    return Response.json({ ok: true, config });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save report schedule." }, { status: 400 });
  }
}
