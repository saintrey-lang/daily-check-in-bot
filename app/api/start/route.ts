import { requireSameOrigin } from "@/lib/request";
import { startEvent, windowAt } from "@/lib/checkin/core";
import { checkinStore } from "@/lib/store";

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  try {
    const { revision } = await request.json() as { revision?: string };
    const store = checkinStore();
    await store.setup();
    const current = await store.readConfig({ fresh: true });
    if (revision !== current.revision) {
      return Response.json({ error: "The codes changed since you last loaded them. Refresh and try again." }, { status: 409 });
    }
    if (current.startedAt && windowAt(new Date(), current)) {
      return Response.json({ error: "An event is already running." }, { status: 409 });
    }
    const config = startEvent(current, new Date());
    await store.saveConfig(config);
    return Response.json({ ok: true, eventId: config.eventId, startDate: config.startDate, code: config.codes[0] });
  } catch (error) {
    console.error("Could not start check-in event.", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not start event." }, { status: 400 });
  }
}
