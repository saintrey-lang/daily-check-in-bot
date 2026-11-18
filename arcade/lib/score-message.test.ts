import { describe, expect, it } from "vitest";
import { buildScoreMessage } from "./score-message";

describe("Discord score messages", () => {
  it("includes the entry name and score for crosswords", () => {
    const message = buildScoreMessage({ game: "crosswords", name: "Saint", score: 1080, elapsed: 30 });
    expect(message.content).toContain("Player: **Saint**");
    expect(message.content).toContain("Score: **1,080**");
    expect(message).not.toHaveProperty("embeds");
  });

  it("includes the same puzzle image the player completed", () => {
    const message = buildScoreMessage({ game: "puzzle", name: "Saint", score: 1200, elapsed: 40, moves: 9, pictureId: 1 });
    expect(message.content).toContain("Player: **Saint**");
    expect(message.content).toContain("Score: **1,200**");
    expect(message.embeds?.[0]?.image.url).toBe("https://golden-spatula-arcade.vercel.app/puzzle-1.webp");
    expect(buildScoreMessage({ game: "puzzle", name: "Saint", score: 1000, elapsed: 60, pictureId: 2 }).embeds?.[0]?.image.url)
      .toBe("https://golden-spatula-arcade.vercel.app/puzzle-2.png");
  });
});
