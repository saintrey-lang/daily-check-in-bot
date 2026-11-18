export type Game = "crosswords" | "puzzle";

export const crossword = {
  rows: 12,
  cols: 11,
  entries: [
    { number: 1, word: "YORDLE", row: 0, col: 4, direction: "across", clue: "Tiny Runeterra folk with outsized charm", hint: "Think of Teemo, Tristana, and Lulu." },
    { number: 2, word: "REROLL", row: 0, col: 6, direction: "down", clue: "Spend gold to refresh the champion shop", hint: "Try your luck with a new set of shop offers." },
    { number: 3, word: "TACTIC", row: 2, col: 9, direction: "down", clue: "Your battle plan in one word", hint: "A strategy for building your winning comp." },
    { number: 4, word: "PORTAL", row: 3, col: 5, direction: "across", clue: "Opening that changes how the lobby plays", hint: "A gateway that can set the rules for a match." },
    { number: 5, word: "SPATULA", row: 5, col: 1, direction: "across", clue: "The golden utensil at the heart of our arena", hint: "This iconic item can help shape team traits." },
    { number: 6, word: "AUGMENT", row: 5, col: 3, direction: "down", clue: "A special choice that powers up your team", hint: "Pick one at key stages to change your comp." },
    { number: 7, word: "ARENA", row: 5, col: 7, direction: "down", clue: "The board where a round is fought", hint: "Your units stand here during combat." },
    { number: 8, word: "CHONCC", row: 10, col: 0, direction: "across", clue: "The round little dragon mascot", hint: "A plump Little Legend with a big appetite." },
  ] as const,
};

export const solvedBoard = [1, 2, 3, 4, 5, 6, 7, 8, 0];

function nextRandom(state: number): number {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

export function boardForSeed(seed: number): number[] {
  const board = [...solvedBoard];
  let previousBlank = -1;
  let state = seed >>> 0 || 1;
  for (let i = 0; i < 36; i++) {
    const blank = board.indexOf(0);
    const choices = adjacent(blank).filter((index) => index !== previousBlank);
    state = nextRandom(state);
    const chosen = choices[state % choices.length];
    [board[blank], board[chosen]] = [board[chosen], board[blank]];
    previousBlank = blank;
  }
  return board;
}

export function adjacent(index: number): number[] {
  const row = Math.floor(index / 3);
  const col = index % 3;
  return [
    row > 0 ? index - 3 : -1,
    row < 2 ? index + 3 : -1,
    col > 0 ? index - 1 : -1,
    col < 2 ? index + 1 : -1,
  ].filter((candidate) => candidate >= 0);
}

export function verifyPuzzle(seed: number, moves: unknown): moves is number[] {
  if (!Array.isArray(moves) || moves.length < 1 || moves.length > 1000) return false;
  const board = boardForSeed(seed);
  for (const move of moves) {
    const blank = board.indexOf(0);
    if (!Number.isInteger(move) || !adjacent(blank).includes(move)) return false;
    [board[blank], board[move]] = [board[move], board[blank]];
  }
  return board.every((tile, index) => tile === solvedBoard[index]);
}

export function verifyCrossword(letters: unknown): boolean {
  if (typeof letters !== "object" || letters === null || Array.isArray(letters)) return false;
  const submitted = letters as Record<string, unknown>;
  const expected = new Map<string, string>();
  for (const entry of crossword.entries) {
    for (let i = 0; i < entry.word.length; i++) {
      const row = entry.row + (entry.direction === "down" ? i : 0);
      const col = entry.col + (entry.direction === "across" ? i : 0);
      const key = `${row}-${col}`;
      if (expected.has(key) && expected.get(key) !== entry.word[i]) throw new Error("Invalid crossword layout");
      expected.set(key, entry.word[i]);
    }
  }
  return Object.keys(submitted).length === expected.size && [...expected].every(([key, letter]) => submitted[key] === letter);
}
