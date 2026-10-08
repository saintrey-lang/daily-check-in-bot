import { Routes, type Client } from "discord.js";
import { localDateAt } from "../lib/checkin/core";
import { observedStaff, STAFF_ROLE_IDS, type StaffMember } from "../lib/staff/core";
import { StatsSheetsStore } from "../lib/stats/sheets";

type DiscordMember = {
  user?: { id: string; username: string; global_name?: string | null; bot?: boolean };
  nick?: string | null; roles?: string[];
};

export function staffFromDiscord(members: DiscordMember[], existing: StaffMember[], today: string): StaffMember[] {
  const old = new Map(existing.map((member) => [member.id, member]));
  return members.flatMap((member) => {
    const user = member.user;
    if (!user || user.bot || !member.roles?.some((id) => STAFF_ROLE_IDS.includes(id as typeof STAFF_ROLE_IDS[number]))) return [];
    return [{ id: user.id, name: member.nick || user.global_name || user.username || user.id,
      roleIds: member.roles.filter((id) => STAFF_ROLE_IDS.includes(id as typeof STAFF_ROLE_IDS[number])),
      firstSeen: old.get(user.id)?.firstSeen || today }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** The HTTP member list needs portal approval, independent of Gateway intents. */
async function listMembers(client: Client, guildId: string): Promise<DiscordMember[]> {
  const all: DiscordMember[] = [];
  let after = "0";
  for (let page = 0; page < 250; page++) {
    const result = await client.rest.get(Routes.guildMembers(guildId), {
      query: new URLSearchParams({ limit: "1000", after }),
    });
    if (!Array.isArray(result)) throw new Error("Discord returned an invalid member list.");
    const members = result as DiscordMember[];
    all.push(...members);
    if (members.length < 1000) return all;
    const last = members.at(-1)?.user?.id;
    if (!last || last === after) throw new Error("Discord member pagination did not advance.");
    after = last;
  }
  throw new Error("Discord member list exceeded the safe pagination limit.");
}

export function attachStaffRoster(client: Client, guildId: string, store: StatsSheetsStore, timeZone: string): void {
  let running = false;
  async function refresh(): Promise<void> {
    if (running || !client.isReady()) return;
    running = true;
    const today = localDateAt(new Date(), timeZone);
    try {
      const existing = await store.readStaffRoster();
      try {
        const members = staffFromDiscord(await listMembers(client, guildId), existing, today);
        await store.saveStaffRoster(members);
        await store.saveRosterState({ status: "complete", syncedAt: new Date().toISOString() });
        console.info(`Staff roster synced: ${members.length} members from the two configured roles.`);
      } catch (error) {
        const failure = error as { status?: number; code?: number; rawError?: { code?: number } } | null;
        const status = failure?.status === 403 || failure?.code === 50001 || failure?.rawError?.code === 50001 ?
          "needs_members_intent" as const : "error" as const;
        if (status === "needs_members_intent") {
          // Clearly label this as an observed-only roster until Discord permits a full list.
          const observed = observedStaff(await store.readRows());
          const previous = new Map(existing.map((member) => [member.id, member]));
          await store.saveStaffRoster(observed.map((member) => ({ ...member,
            firstSeen: previous.get(member.id)?.firstSeen || member.firstSeen })));
        }
        await store.saveRosterState({ status, syncedAt: new Date().toISOString() });
        console.warn(status === "needs_members_intent" ? "Staff roster is limited to observed users until Guild Members intent is enabled." :
          "Could not refresh the staff roster; keeping the last saved list.", error);
      }
    } catch (error) {
      console.error("Could not save the staff roster; statistics tracking continues.", error);
    } finally { running = false; }
  }
  if (client.isReady()) void refresh();
  else client.once("clientReady", () => void refresh());
  setInterval(() => void refresh(), 30 * 60_000);
}
