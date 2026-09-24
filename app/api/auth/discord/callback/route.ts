import {
  cookieFromRequest, cookieHeader, createSession, hasAllowedRole, oauthConfig,
  redirectResponse, SESSION_COOKIE, STATE_COOKIE, stateMatches,
} from "@/lib/auth";

function toLogin(origin: string, reason: string) {
  return new URL(`/login?error=${encodeURIComponent(reason)}`, origin);
}

export async function GET(request: Request) {
  let config;
  try { config = oauthConfig(); }
  catch { return redirectResponse(new URL("/", request.url)); }
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const expected = cookieFromRequest(request, STATE_COOKIE);
  const responseFor = (reason: string) => {
    const response = redirectResponse(toLogin(config.origin, reason));
    response.headers.append("Set-Cookie", cookieHeader(STATE_COOKIE, "", 0, "/api/auth/discord/callback"));
    return response;
  };
  if (url.origin !== config.origin || !stateMatches(state, expected)) return responseFor("state");
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.has("error")) return responseFor("cancelled");
  try {
    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId, client_secret: config.clientSecret,
        grant_type: "authorization_code", code, redirect_uri: config.redirectUri,
      }), cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!tokenResponse.ok) return responseFor("discord");
    const token = await tokenResponse.json() as { access_token?: string; expires_in?: number; scope?: string };
    const scopes = (token.scope || "").split(" ");
    if (!token.access_token || !Number.isFinite(token.expires_in) ||
        !scopes.includes("identify") || !scopes.includes("guilds.members.read")) return responseFor("discord");
    const me = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    if (!me.ok) return responseFor("discord");
    const user = await me.json() as { id?: string };
    if (!user.id || !await hasAllowedRole(token.access_token, user.id, config)) return responseFor("role");
    const session = createSession(token.access_token, user.id, token.expires_in!);
    const response = redirectResponse(new URL("/", config.origin));
    response.headers.append("Set-Cookie", cookieHeader(STATE_COOKIE, "", 0, "/api/auth/discord/callback"));
    response.headers.append("Set-Cookie", cookieHeader(SESSION_COOKIE, session, 7200));
    return response;
  } catch (error) {
    console.error("Discord authorization could not finish.", error);
    return responseFor("discord");
  }
}
