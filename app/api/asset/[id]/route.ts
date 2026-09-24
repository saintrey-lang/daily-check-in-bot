import { requireAdmin } from "@/lib/auth";
import { checkinStore } from "@/lib/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response("Invalid attachment", { status: 400 });
  try {
    const asset = await checkinStore().readAsset(id);
    if (!asset) return new Response("Attachment not found", { status: 404 });
    return new Response(new Uint8Array(asset.bytes), { headers: {
      "Content-Type": asset.mime, "Content-Disposition": `inline; filename="${asset.name}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response("Could not load attachment", { status: 404 });
  }
}
