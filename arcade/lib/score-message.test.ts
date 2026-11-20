import { describe, expect, it } from "vitest";
import { buildProgressMessage, buildScoreMessage } from "./score-message";

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

  it("reports partial points and the Discord channel puzzle image on exit", () => {
    const pictureId = "discord:1573243616925712495:1573243616925712496";
    const message = buildProgressMessage({ game: "puzzle", name: "Saint", gameId: "SAINT1", points: 420, detail: "12 moves · in progress", pictureId });
    expect(message.content).toContain("Current points: **420**");
    expect(message.content).toContain("Player: **Saint**");
    expect(message.embeds?.[0]?.image.url).toContain("/api/puzzle-image?messageId=1573243616925712495&attachmentId=1573243616925712496");
  });
});
