import { requireSameOrigin } from "@/lib/request";
import { startEvent, windowAt } from "@/lib/checkin/core";
import { checkinStore } from "@/lib/store";

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  try {
    const store = checkinStore();
    await store.setup();
    const current = await store.readConfig();
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
