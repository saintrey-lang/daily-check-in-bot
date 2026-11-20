import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPendingDiscordCookie, exchangeDiscordCode, readPendingDiscordCookie } from "./discord-auth";

describe("Discord Activity identity", () => {
  beforeEach(() => {
    process.env.ARCADE_SIGNING_SECRET = "test-signing-secret-with-at-least-thirty-two-characters";
    process.env.DISCORD_APPLICATION_ID = "1545258381936427039";
    process.env.DISCORD_CLIENT_SECRET = "test-secret";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T09:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.ARCADE_SIGNING_SECRET;
    delete process.env.DISCORD_APPLICATION_ID;
    delete process.env.DISCORD_CLIENT_SECRET;
  });

  it("expires the one-time link identity and rejects a modified signature", () => {
    const cookie = createPendingDiscordCookie({ discordId: "1545258381936427039", name: "Saint Rey" });
    expect(readPendingDiscordCookie(cookie)).toEqual({ discordId: "1545258381936427039", name: "Saint Rey" });
    const [payload, signature] = cookie.split(".");
    const changed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    changed.discordId = "1545258381936427040";
    expect(readPendingDiscordCookie(`${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${signature}`)).toBeNull();
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(readPendingDiscordCookie(cookie)).toBeNull();
  });

  it("derives player name only from Discord's verified identify response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "verified-discord-access-token", token_type: "Bearer", scope: "identify" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "1545258381936427039", username: "saintrey" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await exchangeDiscordCode("authorization-code");
    expect(result.identity).toEqual({ discordId: "1545258381936427039", name: "saintrey" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://discord.com/api/oauth2/token");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer verified-discord-access-token");
  });
});
