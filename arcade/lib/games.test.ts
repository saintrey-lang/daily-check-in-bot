import { describe, expect, it } from "vitest";
import { adjacent, boardForSeed, crossword, solvedBoard, verifyCrossword, verifyPuzzle } from "./games";

describe("crossword", () => {
  it("accepts the complete connected grid and rejects a wrong intersection", () => {
    const letters: Record<string, string> = {};
    for (const entry of crossword.entries) {
      for (let i = 0; i < entry.word.length; i++) {
        const key = `${entry.row + (entry.direction === "down" ? i : 0)}-${entry.col + (entry.direction === "across" ? i : 0)}`;
        if (letters[key]) expect(letters[key]).toBe(entry.word[i]);
        letters[key] = entry.word[i];
      }
    }
    expect(verifyCrossword(letters)).toBe(true);
    letters["0-6"] = "X";
    expect(verifyCrossword(letters)).toBe(false);
  });
});

describe("sliding puzzle", () => {
  it("starts with one of each tile and rejects impossible clicks", () => {
    const board = boardForSeed(42);
    expect([...board].sort()).toEqual([...solvedBoard].sort());
    expect(board).not.toEqual(solvedBoard);
    expect(verifyPuzzle(42, [8, 8])).toBe(false);
  });

  it("accepts a played solution", () => {
    let solution: { seed: number; moves: number[] } | undefined;
    for (let seed = 1; seed <= 20000 && !solution; seed++) {
      const board = boardForSeed(seed);
      for (const first of adjacent(board.indexOf(0))) {
        const afterFirst = [...board];
        [afterFirst[first], afterFirst[board.indexOf(0)]] = [afterFirst[board.indexOf(0)], afterFirst[first]];
        for (const second of adjacent(afterFirst.indexOf(0))) {
          const afterSecond = [...afterFirst];
          [afterSecond[second], afterSecond[afterFirst.indexOf(0)]] = [afterSecond[afterFirst.indexOf(0)], afterSecond[second]];
          if (afterSecond.every((tile, position) => tile === solvedBoard[position])) solution = { seed, moves: [first, second] };
        }
      }
    }
    expect(solution).toBeDefined();
    expect(verifyPuzzle(solution!.seed, solution!.moves)).toBe(true);
  });
});
