import { requireSameOrigin } from "@/lib/request";
import { resetEvent, windowAt } from "@/lib/checkin/core";
import { checkinStore } from "@/lib/store";

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  try {
    const body = await request.json() as { revision?: string; scheduledDate?: string };
    const store = checkinStore();
    await store.setup();
    const current = await store.readConfig();
    if (body.revision !== current.revision) {
      return Response.json({ error: "The schedule changed elsewhere. Refresh and try again." }, { status: 409 });
    }
    const now = new Date();
    const previousWindow = windowAt(now, current);
    const previousPrompt = previousWindow && current.eventId
      ? await store.getPrompt(current.eventId, previousWindow.day) : null;
    const config = resetEvent(current, now, body.scheduledDate || undefined);
    config.supersededPromptId = previousPrompt?.messageId ?? null;
    await store.saveConfig(config);
    return Response.json({ ok: true, eventId: config.eventId, startedAt: config.startedAt,
      startDate: config.startDate, code: config.codes[0] });
  } catch (error) {
    console.error("Could not reset check-in event.", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not reset event." }, { status: 400 });
  }
}
