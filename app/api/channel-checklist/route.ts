import { localDateAt } from "@/lib/checkin/core";
import { buildChannelChecklist } from "@/lib/stats/channel-checklist";
import { validStatsDate } from "@/lib/stats/core";
import { statsDashboardSnapshot } from "@/lib/stats/dashboard-snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const timeZone = process.env.CHECKIN_TIMEZONE?.trim() || "Asia/Manila";
  const today = localDateAt(new Date(), timeZone);
  const date = new URL(request.url).searchParams.get("date") || today;
  if (!validStatsDate(date) || date > today) {
    return Response.json({ error: "Choose a valid date on or before today." }, { status: 400 });
  }
  try {
    const { rows, history, progress, plan } = await statsDashboardSnapshot();
    return Response.json(buildChannelChecklist(rows, history, progress, plan, date, today, timeZone));
  } catch (error) {
    console.error("Could not load channel checklist.", error);
    const quota = error instanceof Error && /quota exceeded|rate limit|read requests per minute/i.test(error.message);
    if (quota) return Response.json({ error: "Google Sheets is busy. Please retry in about a minute; tracking continues." },
      { status: 429, headers: { "Retry-After": "60" } });
    return Response.json({ error: "Could not load channel activity. Please try again." }, { status: 503 });
  }
}
