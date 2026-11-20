export function discordClientId(): string | null {
  const configured = process.env.DISCORD_APPLICATION_ID?.trim();
  if (configured && /^\d{17,20}$/.test(configured)) return configured;
  const encoded = process.env.DISCORD_BOT_TOKEN?.split(".")[0];
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    return /^\d{17,20}$/.test(decoded) ? decoded : null;
  } catch { return null; }
}

export function playerCookieOptions(request: Request, maxAge: number) {
  const clientId = discordClientId();
  const proxyDomain = clientId ? `${clientId}.discordsays.com` : null;
  const origin = request.headers.get("origin");
  const host = new URL(request.url).hostname;
  const inActivity = !!proxyDomain && (host === proxyDomain || origin === `https://${proxyDomain}` || request.headers.get("x-arcade-activity") === "1");
  if (inActivity) return { httpOnly: true, secure: true, sameSite: "none" as const, partitioned: true, domain: proxyDomain!, path: "/", maxAge };
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}
