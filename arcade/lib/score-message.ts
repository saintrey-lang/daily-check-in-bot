import { puzzlePicture, type Game, type PuzzlePictureId } from "./games";

const SITE_ORIGIN = "https://golden-spatula-arcade.vercel.app";

export function buildScoreMessage(input: {
  game: Game;
  name: string;
  score: number;
  elapsed: number;
  moves?: number;
  pictureId?: PuzzlePictureId;
}) {
  const title = input.game === "crosswords" ? "GOLDEN SPATULA CROSSWORDS" : "GOLDEN SPATULA PUZZLE";
  const content = [
    `🏆 **${title} — completed!**`,
    `Player: **${input.name}**`,
    `Score: **${input.score.toLocaleString("en-US")}** · Time: **${Math.floor(input.elapsed / 60)}m ${input.elapsed % 60}s**${input.moves ? ` · Moves: **${input.moves}**` : ""}`,
  ].join("\n");
  if (input.game === "crosswords") return { content };

  const picture = puzzlePicture(input.pictureId ?? 2);
  return {
    content,
    embeds: [{
      title: picture.label,
      image: { url: new URL(picture.src, SITE_ORIGIN).toString() },
      color: 0x6b4bea,
    }],
  };
}

export function buildProgressMessage(input: {
  game: Game; name: string; gameId: string; points: number; detail: string; pictureId?: PuzzlePictureId;
}) {
  const title = input.game === "puzzle" ? "GOLDEN SPATULA PUZZLE" : "GOLDEN SPATULA CROSSWORDS";
  const content = [
    `🎮 **${title} — session ended**`,
    `Player: **${input.name}** · Game ID: **${input.gameId}**`,
    `Current points: **${input.points.toLocaleString("en-US")}** · ${input.detail}`,
    "Progress saved. Tap the game again to continue.",
  ].join("\n");
  if (input.game === "crosswords") return { content };
  const picture = puzzlePicture(input.pictureId ?? 2);
  return { content, embeds: [{ title: picture.label, image: { url: new URL(picture.src, SITE_ORIGIN).toString() }, color: 0x6b4bea }] };
}
