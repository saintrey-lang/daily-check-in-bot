import { windowAt } from "@/lib/checkin/core";
import { checkinStore } from "@/lib/store";

export async function GET() {
  try {
    const store = checkinStore();
    await store.setup();
    const config = await store.readConfig();
    const window = windowAt(new Date(), config);
    const prompt = window && config.eventId ? await store.getPrompt(config.eventId, window.day) : null;
    const records = config.eventId ? await store.readCheckins(config.eventId) : [];
    const today = window ? records.filter((record) => record.day === window.day).length : 0;
    return Response.json({ config, window, prompt, today, total: records.length });
  } catch (error) {
    console.error("Could not load check-in status.", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not load check-in status." }, { status: 503 });
  }
}
