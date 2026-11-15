import { randomUUID } from "node:crypto";
import { requireSameOrigin } from "@/lib/request";
import { validateConfig, windowAt } from "@/lib/checkin/core";
import { checkinStore } from "@/lib/store";

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  try {
    const body = await request.json() as { revision?: string; day?: number; code?: string };
    const store = checkinStore();
    await store.setup();
    const current = await store.readConfig();
    if (body.revision !== current.revision) {
      return Response.json({ error: "The codes changed elsewhere. Refresh and try again." }, { status: 409 });
    }
    const window = windowAt(new Date(), current);
    if (!window || body.day !== window.day) {
      return Response.json({ error: "The active day changed. Refresh to see today's code." }, { status: 409 });
    }
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
      return Response.json({ error: "Enter 2–32 letters, digits, _ or - for today's code." }, { status: 400 });
    }
    const codes = [...current.codes];
    codes[window.day - 1] = code;
    const config = { ...current, codes, revision: randomUUID() };
    validateConfig(config);
    await store.saveConfig(config);
    return Response.json({ ok: true, day: window.day, code });
  } catch (error) {
    console.error("Could not save today's check-in code.", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not save today's code." }, { status: 400 });
  }
}
