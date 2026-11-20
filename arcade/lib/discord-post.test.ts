import { afterEach, describe, expect, it, vi } from "vitest";
import { postArcadeMessage, SCORE_CHANNEL_ID } from "./discord-post";
import { buildProgressMessage, buildScoreMessage } from "./score-message";

describe("Arcade score channel", () => {
  afterEach(() => {
    delete process.env.DISCORD_BOT_TOKEN;
    vi.unstubAllGlobals();
  });

  it("posts crossword scores, puzzle scores, and puzzle exit points to the same score channel", async () => {
    process.env.DISCORD_BOT_TOKEN = "test-bot-token";
    const send = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: "111222333444555666" }), { status: 200 })));
    vi.stubGlobal("fetch", send);
    const messages = [
      buildScoreMessage({ game: "crosswords", name: "Saint", score: 1000, elapsed: 50 }),
      buildScoreMessage({ game: "puzzle", name: "Saint", score: 900, elapsed: 90, pictureId: 1 }),
      buildProgressMessage({ game: "puzzle", name: "Saint", gameId: "SAINT1", points: 200, detail: "in progress", pictureId: 1 }),
    ];
    for (const [index, message] of messages.entries()) {
      const url = await postArcadeMessage(message, `test:${index}`);
      expect(url).toBe(`https://discord.com/channels/1293483684888055840/${SCORE_CHANNEL_ID}/111222333444555666`);
    }
    expect(send.mock.calls).toHaveLength(3);
    for (const [url] of send.mock.calls) expect(url).toBe(`https://discord.com/api/v10/channels/${SCORE_CHANNEL_ID}/messages`);
    expect(JSON.parse(send.mock.calls[1][1].body).embeds[0].image.url).toContain("puzzle-1.webp");
  });
});
