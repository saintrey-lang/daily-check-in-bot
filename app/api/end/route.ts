import { requireSameOrigin } from "@/lib/request";
import { endEvent, windowAt } from "@/lib/checkin/core";
import { checkinStore } from "@/lib/store";

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  try {
    const body = await request.json() as { revision?: string };
    const store = checkinStore();
    await store.setup();
    const current = await store.readConfig();
    if (body.revision !== current.revision) {
      return Response.json({ error: "The run changed elsewhere. Refresh and try again." }, { status: 409 });
    }
    const now = new Date();
    const previousWindow = windowAt(now, current);
    const previousPrompt = previousWindow && current.eventId
      ? await store.getPrompt(current.eventId, previousWindow.day) : null;
    const config = endEvent(current, now);
    config.supersededPromptId = previousPrompt?.messageId ?? current.supersededPromptId ?? null;
    await store.saveConfig(config);
    return Response.json({ ok: true, eventId: config.lastEventId, endedAt: config.endedAt });
  } catch (error) {
    console.error("Could not end check-in run.", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not end run." }, { status: 400 });
  }
}
