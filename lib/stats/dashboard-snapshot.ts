import { defaultConfig } from "../checkin/core";
import { StatsSheetsStore, type StatsDashboardSnapshot } from "./sheets";

let cached: { value: StatsDashboardSnapshot; at: number } | null = null;
let pending: { version: number; promise: Promise<StatsDashboardSnapshot> } | null = null;
let cacheVersion = 0;

/** Share one short-lived Sheets read between the statistics and channel checklist views. */
export async function statsDashboardSnapshot(): Promise<StatsDashboardSnapshot> {
  if (cached && Date.now() - cached.at < 30_000) return cached.value;
  if (pending?.version === cacheVersion) return pending.promise;
  const version = cacheVersion;
  const promise = new StatsSheetsStore(defaultConfig(process.env).sheetId).readDashboardSnapshot().then((value) => {
    if (version === cacheVersion) cached = { value, at: Date.now() };
    return value;
  }).finally(() => { if (pending?.promise === promise) pending = null; });
  pending = { version, promise };
  return promise;
}

export function invalidateStatsDashboardSnapshot(): void {
  cacheVersion++;
  cached = null;
  pending = null;
}
