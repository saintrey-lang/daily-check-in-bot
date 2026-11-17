import { localDateAt } from "@/lib/checkin/core";
import { buildChannelChecklist } from "@/lib/stats/channel-checklist";
import { shiftDate, validStatsDate } from "@/lib/stats/core";
import { statsDashboardSnapshot } from "@/lib/stats/dashboard-snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const timeZone = process.env.CHECKIN_TIMEZONE?.trim() || "Asia/Manila";
  const today = localDateAt(new Date(), timeZone);
  const params = new URL(request.url).searchParams;
  const date = params.get("date") || today;
  const from = params.get("from") || shiftDate(today, -6);
  const to = params.get("to") || today;
  if (!validStatsDate(date) || date > today) {
    return Response.json({ error: "Choose a valid date on or before today." }, { status: 400 });
  }
  if (!validStatsDate(from) || !validStatsDate(to) || from > to || to > today ||
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 >= 31) {
    return Response.json({ error: "Choose a valid date range of up to 31 days, ending on or before today." }, { status: 400 });
  }
  try {
    const { rows, history, progress, plan } = await statsDashboardSnapshot();
    return Response.json(buildChannelChecklist(rows, history, progress, plan, date, from, to, today, timeZone));
  } catch (error) {
    console.error("Could not load channel checklist.", error);
    const quota = error instanceof Error && /quota exceeded|rate limit|read requests per minute/i.test(error.message);
    if (quota) return Response.json({ error: "Google Sheets is busy. Please retry in about a minute; tracking continues." },
      { status: 429, headers: { "Retry-After": "60" } });
    return Response.json({ error: "Could not load channel activity. Please try again." }, { status: 503 });
  }
}
