export const STARPLAYER_CHANNEL_ID = "1552725214868275261";
export const STARPLAYER_SHEET_ID = "1aYqwNCdicmFhsITN9pXQE7shDw8xDeVT-5RUkIL3QsI";

export const STARPLAYER_CATEGORIES = [
  { id: "strategy-tips", label: "Strategy & Tips" },
  { id: "engagement", label: "Engagement" },
  { id: "version-discussion", label: "Version Discussion" },
] as const;

export type StarplayerCategory = (typeof STARPLAYER_CATEGORIES)[number]["id"];
export type StarplayerSubmission = {
  id: string;
  submittedAt: string;
  taskDate: string;
  userId: string;
  username: string;
  displayName: string;
  category: StarplayerCategory;
  link: string;
  attachmentName: string;
  messageUrl: string;
  messageId: string;
  channelId: string;
  guildId: string;
};

export function todayInManila(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function validateTaskDate(input: string, now: Date = new Date()): string {
  const date = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error("Enter the task date as YYYY-MM-DD, for example 2026-09-18.");
  }
  if (date > todayInManila(now)) throw new Error("Task Date cannot be in the future (Manila time).");
  return date;
}

export function categoryFor(value: string): (typeof STARPLAYER_CATEGORIES)[number] | null {
  return STARPLAYER_CATEGORIES.find((category) => category.id === value || category.label === value) ?? null;
}

export function validateSubmission(linkInput: string, attachmentName: string): string {
  const link = linkInput.trim();
  if (!link && !attachmentName) throw new Error("Add a submission link or attach a file.");
  if (link) {
    if (link.length > 1000) throw new Error("The submission link is too long (1,000 characters maximum).");
    try {
      if (new URL(link).protocol !== "https:") throw new Error("Invalid link");
    } catch {
      throw new Error("Use a complete https:// submission link.");
    }
  }
  return link;
}

export function starplayerSummary(submissions: StarplayerSubmission[]) {
  const people = new Map<string, {
    userId: string; username: string; displayName: string;
    categories: Set<StarplayerCategory>; submissions: number; latestAt: string;
  }>();
  for (const submission of submissions) {
    const person = people.get(submission.userId) ?? {
      userId: submission.userId, username: submission.username, displayName: submission.displayName,
      categories: new Set<StarplayerCategory>(), submissions: 0, latestAt: "",
    };
    person.username = submission.username;
    person.displayName = submission.displayName;
    person.categories.add(submission.category);
    person.submissions += 1;
    if (submission.submittedAt > person.latestAt) person.latestAt = submission.submittedAt;
    people.set(submission.userId, person);
  }
  const players = [...people.values()].map((person) => ({
    ...person, categories: STARPLAYER_CATEGORIES.filter((category) => person.categories.has(category.id)).map((category) => category.id),
  })).sort((a, b) => b.categories.length - a.categories.length || b.submissions - a.submissions || a.displayName.localeCompare(b.displayName));
  return {
    totalSubmissions: submissions.length,
    uniquePlayers: players.length,
    completedTasks: players.reduce((sum, player) => sum + player.categories.length, 0),
    categories: STARPLAYER_CATEGORIES.map((category) => ({
      ...category,
      submissions: submissions.filter((submission) => submission.category === category.id).length,
      players: players.filter((player) => player.categories.includes(category.id)).length,
    })),
    players,
    recent: [...submissions].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 50),
  };
}
