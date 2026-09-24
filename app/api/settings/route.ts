import { randomUUID } from "node:crypto";
import { requireSameOrigin } from "@/lib/request";
import { validateConfig, windowAt, type EmbedTemplate } from "@/lib/checkin/core";
import { validateUpload } from "@/lib/checkin/sheets";
import { checkinStore } from "@/lib/store";

type Field = "prompt" | "success";
function string(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== "string") throw new Error(`Missing field: ${key}.`);
  return value.trim();
}

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  try {
    const form = await request.formData();
    const store = checkinStore();
    await store.setup();
    const current = await store.readConfig();
    if (string(form, "revision") !== current.revision) return Response.json({ error: "The dashboard changed elsewhere. Refresh and try again." }, { status: 409 });
    const timeZone = string(form, "timeZone");
    if (windowAt(new Date(), current) && timeZone !== current.timeZone) throw new Error("The timezone cannot change while a check-in is running.");
    const codes = string(form, "codes").split(/[\s,]+/).map((code) => code.toUpperCase()).filter(Boolean);
    const edits: Record<Field, EmbedTemplate> = {
      prompt: { title: string(form, "promptTitle"), description: string(form, "promptDescription"), color: string(form, "promptColor"), assetId: current.prompt.assetId },
      success: { title: string(form, "successTitle"), description: string(form, "successDescription"), color: string(form, "successColor"), assetId: current.success.assetId },
    };
    const uploads: Array<{ target: Field; name: string; mime: string; bytes: Buffer }> = [];
    for (const target of ["prompt", "success"] as const) {
      if (string(form, `${target}Remove`) === "true") edits[target].assetId = null;
      const file = form.get(`${target}File`);
      if (file instanceof File && file.size) {
        if (file.size > 1024 * 1024) throw new Error("Each attachment must be 1 MB or smaller.");
        const bytes = Buffer.from(await file.arrayBuffer());
        validateUpload(file.name, file.type, bytes);
        uploads.push({ target, name: file.name, mime: file.type, bytes });
      }
    }
    const updated = { ...current, timeZone, codes, prompt: edits.prompt, success: edits.success, revision: randomUUID() };
    validateConfig(updated);
    for (const file of uploads) {
      const asset = await store.saveAsset(file.name, file.mime, file.bytes);
      updated[file.target].assetId = asset.id;
    }
    await store.saveConfig(updated);
    return Response.json({ ok: true, config: updated });
  } catch (error) {
    console.error("Could not save check-in settings.", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not save settings." }, { status: 400 });
  }
}
