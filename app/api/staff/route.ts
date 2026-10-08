import { defaultConfig, localDateAt } from "@/lib/checkin/core";
import { requireSameOrigin } from "@/lib/request";
import { observedStaff, staffPerformance, STAFF_ROLE_IDS, validatePins } from "@/lib/staff/core";
import { shiftDate } from "@/lib/stats/core";
import { StatsSheetsStore, type StaffSnapshot } from "@/lib/stats/sheets";

export const dynamic = "force-dynamic";
const timeZone = process.env.CHECKIN_TIMEZONE?.trim() || "Asia/Manila";
function store() { return new StatsSheetsStore(defaultConfig(process.env).sheetId); }

let cached: { value: StaffSnapshot; at: number } | null = null;
let pending: { version: number; promise: Promise<StaffSnapshot> } | null = null;
let cacheVersion = 0;
async function snapshot(): Promise<StaffSnapshot> {
  if (cached && Date.now() - cached.at < 30_000) return cached.value;
  if (pending?.version === cacheVersion) return pending.promise;
  const version = cacheVersion;
  const promise = store().readStaffSnapshot().then((value) => {
    if (version === cacheVersion) cached = { value, at: Date.now() };
    return value;
  }).finally(() => { if (pending?.promise === promise) pending = null; });
  pending = { version, promise };
  return promise;
}

function roster(data: StaffSnapshot) {
  return data.rosterState.status === "complete" ? data.roster : data.roster.length ? data.roster : observedStaff(data.live);
}

export async function GET(request: Request) {
  try {
    const data = await snapshot();
    const today = localDateAt(new Date(), timeZone);
    const params = new URL(request.url).searchParams;
    const start = params.get("start") || shiftDate(today, -13);
    const end = params.get("end") || today;
    const members = roster(data);
    const pins = data.pins.filter((id) => members.some((member) => member.id === id));
    const staff = staffPerformance({ live: data.live, history: data.history, progress: data.progress,
      plan: data.plan, roster: members, pins, today, start, end });
    return Response.json({ staff, pins, rosterState: data.rosterState, roleIds: STAFF_ROLE_IDS, roles: data.roles,
      start, end, today, earliest: shiftDate(today, -89), timeZone, targets: { daily: 50, weekend: 145 } });
  } catch (error) {
    console.error("Could not load Staff Corner.", error);
    const invalid = error instanceof Error && /Choose a valid staff detail/.test(error.message);
    return Response.json({ error: invalid ? error.message : "Could not load Staff Corner. Please retry shortly." }, { status: invalid ? 400 : 503 });
  }
}

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  try {
    const body = await request.json() as { pins?: unknown };
    const data = await snapshot();
    const pins = validatePins(body.pins, roster(data));
    await store().saveStaffPins(pins);
    cacheVersion++; cached = null; pending = null;
    return Response.json({ ok: true, pins });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save pinned staff." }, { status: 400 });
  }
}
