import { defaultConfig, localDateAt } from "@/lib/checkin/core";
import { requireSameOrigin } from "@/lib/request";
import { channelDrilldownRows, roleMemberPerformance, shiftDate, statsSummaryRange, validStatsDate, validateStatsConfig, type StatsConfig } from "@/lib/stats/core";
import { StatsSheetsStore, type StatsDashboardSnapshot } from "@/lib/stats/sheets";

export const dynamic = "force-dynamic";

function store() {
  return new StatsSheetsStore(defaultConfig(process.env).sheetId);
}

let cached: { value: StatsDashboardSnapshot; at: number } | null = null;
let pending: { version: number; promise: Promise<StatsDashboardSnapshot> } | null = null;
let cacheVersion = 0;
async function snapshot(): Promise<StatsDashboardSnapshot> {
  if (cached && Date.now() - cached.at < 30_000) return cached.value;
  if (pending?.version === cacheVersion) return pending.promise;
  const version = cacheVersion;
  const promise = store().readDashboardSnapshot().then((value) => {
    if (version === cacheVersion) cached = { value, at: Date.now() };
    return value;
  }).finally(() => { if (pending?.promise === promise) pending = null; });
  pending = { version, promise };
  return promise;
}

export async function GET(request: Request) {
  try {
    const { rows, history, progress, plan, roles, config, lastReport } = await snapshot();
    const today = localDateAt(new Date(), process.env.CHECKIN_TIMEZONE?.trim() || "Asia/Manila");
    const params = new URL(request.url).searchParams;
    const period = params.get("period") || "seven";
    if (!["seven", "thirty", "custom", "all"].includes(period)) throw new Error("Choose a valid statistics period.");
    const end = params.get("end") || today;
    if (!validStatsDate(end) || end > today) throw new Error("Choose a date on or before today.");
    const start = period === "custom" ? (params.get("start") || end) :
      period === "all" ? (plan?.from || end) : shiftDate(end, period === "seven" ? -6 : -29);
    const roleId = params.get("roleId") || "";
    if (roleId && !/^\d{17,20}$/.test(roleId)) throw new Error("Choose a valid Discord role.");
    const memberRoleId = params.get("memberRoleId") || "";
    if (memberRoleId && !/^\d{17,20}$/.test(memberRoleId)) throw new Error("Choose a valid Discord role.");
    const periodSummary = statsSummaryRange(rows, start, end, { history, progress, plan });
    const summary = roleId ? statsSummaryRange(rows, start, end, { history, progress, plan, roleId }) : periodSummary;
    return Response.json({
      summary,
      channelDrilldown: channelDrilldownRows(summary, progress),
      memberRoleId,
      memberRoster: memberRoleId ? roleMemberPerformance(rows, history, progress, plan, memberRoleId, periodSummary.members) : [],
      config, lastReport, roles, historyPlan: plan,
      historyProgress: { total: progress.length, complete: progress.filter((item) => item.status === "complete").length,
        errors: progress.filter((item) => item.status === "error").map(({ channelName, error }) => ({ channelName, error })) },
      today,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${defaultConfig(process.env).sheetId}/edit`,
    });
  } catch (error) {
    console.error("Could not load server statistics.", error);
    const invalid = error instanceof Error && /Choose a /.test(error.message);
    const quota = !invalid && error instanceof Error && /quota exceeded|rate limit|read requests per minute/i.test(error.message);
    if (quota) return Response.json({ error: "Google Sheets is busy. Please retry in about a minute; tracking continues." },
      { status: 429, headers: { "Retry-After": "60" } });
    return Response.json({ error: error instanceof Error ? error.message : "Could not load server statistics." }, { status: invalid ? 400 : 503 });
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
      enabledAt: new Date().toISOString(),
    });
    const sheet = store();
    await sheet.saveConfig(config);
    cacheVersion++; cached = null; pending = null;
    return Response.json({ ok: true, config });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save report schedule." }, { status: 400 });
  }
}
