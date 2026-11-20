import { boardAfterMoves, boardForSeed, crossword, solvedBoard } from "./games";
import type { Session } from "./session";

export type GameProgress = { letters: Record<string, string> } | { moves: number[] };

const answerCells = new Map<string, string>();
for (const entry of crossword.entries) {
  for (let index = 0; index < entry.word.length; index++) {
    const row = entry.row + (entry.direction === "down" ? index : 0);
    const col = entry.col + (entry.direction === "across" ? index : 0);
    answerCells.set(`${row}-${col}`, entry.word[index]);
  }
}

export function readProgress(session: Session, value: unknown): { state: GameProgress; points: number; detail: string; board?: number[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (session.game === "crosswords") {
    if (!data.letters || typeof data.letters !== "object" || Array.isArray(data.letters)) return null;
    const input = data.letters as Record<string, unknown>;
    if (Object.keys(input).length > answerCells.size || Object.keys(input).some((key) => !answerCells.has(key))) return null;
    const letters: Record<string, string> = {};
    for (const [key, letter] of Object.entries(input)) {
      if (typeof letter !== "string" || !/^[A-Z]?$/.test(letter)) return null;
      if (letter) letters[key] = letter;
    }
    const correct = crossword.entries.filter((entry) => [...entry.word].every((letter, index) => {
      const row = entry.row + (entry.direction === "down" ? index : 0);
      const col = entry.col + (entry.direction === "across" ? index : 0);
      return letters[`${row}-${col}`] === letter;
    })).length;
    return { state: { letters }, points: Math.round(1200 * correct / crossword.entries.length), detail: `${correct}/${crossword.entries.length} clues correct` };
  }

  const board = boardAfterMoves(session.seed, data.moves);
  if (!board) return null;
  const moves = data.moves as number[];
  const distance = (tiles: number[]) => tiles.reduce((sum, tile, index) => {
    if (!tile) return sum;
    const goal = tile - 1;
    return sum + Math.abs(Math.floor(index / 3) - Math.floor(goal / 3)) + Math.abs(index % 3 - goal % 3);
  }, 0);
  const initialDistance = distance(boardForSeed(session.seed));
  const progress = Math.max(0, Math.min(1, (initialDistance - distance(board)) / Math.max(1, initialDistance)));
  const solved = board.every((tile, index) => tile === solvedBoard[index]);
  return { state: { moves }, points: moves.length ? Math.round(1400 * progress) : 0, detail: `${moves.length} moves · ${solved ? "image complete" : "in progress"}`, board };
}
