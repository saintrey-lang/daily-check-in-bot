import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, decodeSession, hasAllowedRole, oauthConfig, requireAdmin, SESSION_COOKIE, stateMatches } from "../lib/auth";

describe("Discord dashboard access", () => {
  beforeEach(() => {
    vi.stubEnv("DISCORD_CLIENT_ID", "1545258381936427039");
    vi.stubEnv("DISCORD_CLIENT_SECRET", "only-for-tests-abc123");
    vi.stubEnv("DISCORD_ALLOWED_ROLE_ID", "123456789012345678");
    vi.stubEnv("CHECKIN_GUILD_ID", "1293483684888055840");
    vi.stubEnv("DASHBOARD_BASE_URL", "https://dashboard.example.com");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("rejects a changed session, an expired session, and an unrelated OAuth state", () => {
    const now = Date.now();
    const cookie = createSession("discord-access-token", "987654321012345678", 7200, now);
    expect(decodeSession(cookie, now + 1000)?.userId).toBe("987654321012345678");
    const [iv, content, tag] = cookie.split(".");
    expect(decodeSession(`${iv}.${content[0] === "a" ? "b" : "a"}${content.slice(1)}.${tag}`, now)).toBeNull();
    expect(decodeSession(cookie, now + 7_201_000)).toBeNull();
    expect(stateMatches("a".repeat(64), "a".repeat(64))).toBe(true);
    expect(stateMatches("b".repeat(64), "a".repeat(64))).toBe(false);
  });

  it("denies protected operations after a Discord role is removed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ roles: ["123456789012345678"] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ roles: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const cookie = createSession("discord-access-token", "987654321012345678", 7200);
    const request = new Request("https://dashboard.example.com/api/start", {
      method: "POST", headers: { cookie: `${SESSION_COOKIE}=${cookie}`, origin: "https://dashboard.example.com" },
    });
    expect(await requireAdmin(request, true)).toBeNull();
    expect((await requireAdmin(request, true))?.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed if Discord is unavailable or returns a member from another account", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ roles: ["123456789012345678"], user: { id: "999999999999999999" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await hasAllowedRole("token", "987654321012345678", oauthConfig())).toBe(false);
    expect(await hasAllowedRole("token", "987654321012345678", oauthConfig())).toBe(false);
  });
});
