import { describe, expect, it } from "vitest";
import { adjacent, boardForSeed, crossword } from "./games";
import { readProgress } from "./progress";
import type { Session } from "./session";

const base: Session = { id: "0123456789abcdef01234567", game: "crosswords", playerId: "PLAYER123", seed: 42, issuedAt: Date.now() };

describe("resumable game progress", () => {
  it("awards points for correct clues and rejects invalid letters", () => {
    const clue = crossword.entries[0];
    const letters = Object.fromEntries([...clue.word].map((letter, index) => [`${clue.row}-${clue.col + index}`, letter]));
    const progress = readProgress(base, { letters });
    expect(progress?.points).toBe(150);
    expect(progress?.detail).toBe("1/8 clues correct");
    expect(readProgress(base, { letters: { "0-4": "*" } })).toBeNull();
  });

  it("replays puzzle moves into the same board after resuming", () => {
    const session: Session = { ...base, game: "puzzle", pictureId: 1 };
    const board = boardForSeed(session.seed);
    const move = adjacent(board.indexOf(0))[0];
    const expected = [...board];
    [expected[expected.indexOf(0)], expected[move]] = [expected[move], expected[expected.indexOf(0)]];
    const progress = readProgress(session, { moves: [move] });
    expect(progress?.board).toEqual(expected);
    expect(progress?.points).toBeGreaterThanOrEqual(0);
    expect(readProgress(session, { moves: [8, 8] })).toBeNull();
  });
});
