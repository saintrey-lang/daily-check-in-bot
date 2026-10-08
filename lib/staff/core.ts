import { shiftDate, validStatsDate, type HistoryPlan, type HistoryProgress, type StatDelta } from "../stats/core";

export const STAFF_ROLE_IDS = ["1294024616968323072", "1295351420635058237"] as const;
export const DAILY_TARGET = 50;
export const WEEKEND_TARGET = 145;

export type StaffMember = { id: string; name: string; roleIds: string[]; firstSeen: string };
export type RosterState = { status: "pending" | "complete" | "needs_members_intent" | "error"; syncedAt: string };
export type QuotaStatus = "success" | "failure" | "in_progress" | "not_started";
export type DailyRecord = { date: string; messages: number; target: number; status: QuotaStatus; remark: string };
export type WeekendRecord = { start: string; end: string; messages: number; target: number; status: QuotaStatus; remark: string };
export type StaffPerformance = StaffMember & {
  pinned: boolean; quotaStart: string; todayMessages: number; selectedMessages: number;
  dailySuccess: number; dailyFailure: number; weekendSuccess: number; weekendFailure: number;
  success: number; failure: number; daily: DailyRecord[]; weekends: WeekendRecord[];
  currentWeekend: WeekendRecord | null;
};

export function observedStaff(rows: StatDelta[]): StaffMember[] {
  const members = new Map<string, StaffMember & { last: string }>();
  for (const row of rows) {
    if (row.isBot || !row.userId) continue;
    const old = members.get(row.userId);
    const hasStaffRole = (row.roleIds ?? []).some((id) => STAFF_ROLE_IDS.includes(id as typeof STAFF_ROLE_IDS[number]));
    const firstSeen = hasStaffRole && (!old?.firstSeen || row.date < old.firstSeen) ? row.date : old?.firstSeen ?? "";
    if (!old || row.recordedAt >= old.last) {
      members.set(row.userId, { id: row.userId, name: row.displayName || old?.name || row.userId,
        roleIds: row.roleIds ?? [], firstSeen, last: row.recordedAt });
    } else old.firstSeen = firstSeen;
  }
  return [...members.values()].filter((member) => member.firstSeen && member.roleIds.some((id) => STAFF_ROLE_IDS.includes(id as typeof STAFF_ROLE_IDS[number])))
    .map(({ last: _last, ...member }) => member);
}

export function validatePins(input: unknown, members: StaffMember[]): string[] {
  if (!Array.isArray(input) || input.length > 10 || input.some((id) => typeof id !== "string" || !/^\d{17,20}$/.test(id))) {
    throw new Error("Pin up to 10 staff members using their Discord IDs.");
  }
  const pins = input as string[];
  if (new Set(pins).size !== pins.length || pins.some((id) => !members.some((member) => member.id === id))) {
    throw new Error("Each pinned user must be a different member of the current staff list.");
  }
  return pins;
}

function quota(messages: number, target: number, closed: boolean): { status: QuotaStatus; remark: string } {
  if (messages >= target) return { status: "success", remark: "Target reached" };
  const remaining = target - messages;
  return closed ? { status: "failure", remark: `Missed by ${remaining}` } :
    { status: "in_progress", remark: `${remaining} remaining` };
}

function saturdayFor(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((day + 1) % 7));
}

/** Counts one message once even if a retried Sheet append produced duplicate rows. */
export function staffPerformance(input: {
  live: StatDelta[]; history: StatDelta[]; progress: HistoryProgress[]; plan: HistoryPlan | null;
  roster: StaffMember[]; pins: string[]; today: string; start: string; end: string;
}): StaffPerformance[] {
  const { live, history, progress, plan, roster, pins, today, start, end } = input;
  if (!validStatsDate(start) || !validStatsDate(end) || start > end || end > today ||
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 > 89) {
    throw new Error("Choose a valid staff detail range of up to 90 days.");
  }
  const ids = new Set(roster.map((member) => member.id));
  const covered = new Map(progress.map((state) => [state.channelId, state.coveredAfter]));
  const imported = (row: StatDelta) => !!plan && row.date >= plan.from && row.date < plan.until &&
    !!covered.get(row.channelId) && row.date > covered.get(row.channelId)!;
  const counts = new Map<string, Map<string, number>>();
  const seen = new Set<string>();
  for (const [source, rows] of [["live", live], ["history", history]] as const) {
    for (const row of rows) {
      if (!ids.has(row.userId) || row.isBot || row.date > today || seen.has(`${source}:${row.id}`) ||
        (source === "history" && !imported(row))) continue;
      seen.add(`${source}:${row.id}`);
      const messages = source === "live" && imported(row) ? 0 : row.messages;
      const days = counts.get(row.userId) ?? new Map<string, number>();
      days.set(row.date, (days.get(row.date) ?? 0) + messages);
      counts.set(row.userId, days);
    }
  }
  const pinned = new Map(pins.map((id, index) => [id, index]));
  return roster.map((member) => {
    const days = counts.get(member.id) ?? new Map<string, number>();
    const quotaStart = shiftDate(member.firstSeen, 1); // Avoid scoring a partial first day or unknown earlier role history.
    const daily: DailyRecord[] = [];
    let dailySuccess = 0; let dailyFailure = 0; let selectedMessages = 0;
    for (let date = quotaStart < start ? quotaStart : start; date <= today; date = shiftDate(date, 1)) {
      const messages = date < member.firstSeen ? 0 : days.get(date) ?? 0;
      if (date >= start && date <= end) selectedMessages += messages;
      const result = date < quotaStart ? { status: "not_started" as const, remark: `Starts ${quotaStart}` } : quota(messages, DAILY_TARGET, date < today);
      if (date >= quotaStart && result.status === "success") dailySuccess++;
      if (date >= quotaStart && result.status === "failure") dailyFailure++;
      if (date >= start && date <= end) daily.push({ date, messages, target: DAILY_TARGET, ...result });
    }
    daily.sort((a, b) => b.date.localeCompare(a.date));
    const weekends: WeekendRecord[] = [];
    let weekendSuccess = 0; let weekendFailure = 0; let currentWeekend: WeekendRecord | null = null;
    let saturday = saturdayFor(quotaStart);
    if (saturday < quotaStart) saturday = shiftDate(saturday, 7);
    for (; saturday <= today; saturday = shiftDate(saturday, 7)) {
      const sunday = shiftDate(saturday, 1);
      const messages = (days.get(saturday) ?? 0) + (days.get(sunday) ?? 0);
      const result = quota(messages, WEEKEND_TARGET, sunday < today);
      if (result.status === "success") weekendSuccess++;
      if (result.status === "failure") weekendFailure++;
      const record = { start: saturday, end: sunday, messages, target: WEEKEND_TARGET, ...result };
      if (saturday <= today && today <= sunday) currentWeekend = record;
      if (saturday <= end && sunday >= start) weekends.push(record);
    }
    return { ...member, pinned: pinned.has(member.id), quotaStart, todayMessages: days.get(today) ?? 0,
      selectedMessages, dailySuccess, dailyFailure, weekendSuccess, weekendFailure,
      success: dailySuccess + weekendSuccess, failure: dailyFailure + weekendFailure,
      daily, weekends: weekends.reverse(), currentWeekend };
  }).sort((a, b) => (pinned.get(a.id) ?? 99) - (pinned.get(b.id) ?? 99) ||
    b.selectedMessages - a.selectedMessages || a.name.localeCompare(b.name));
}
