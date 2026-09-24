import { cookieHeader, oauthConfig, randomState, redirectResponse, STATE_COOKIE } from "@/lib/auth";

export async function GET(request: Request) {
  let config;
  try { config = oauthConfig(); }
  catch { return redirectResponse(new URL("/", request.url)); }
  if (new URL(request.url).origin !== config.origin) {
    return redirectResponse(new URL("/api/auth/discord", config.origin));
  }
  const state = randomState();
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "identify guilds.members.read");
  url.searchParams.set("state", state);
  const response = redirectResponse(url);
  response.headers.set("Set-Cookie", cookieHeader(STATE_COOKIE, state, 600, "/api/auth/discord/callback"));
  return response;
}
