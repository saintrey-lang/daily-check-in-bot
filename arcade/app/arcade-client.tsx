"use client";

import { useEffect, useRef, useState } from "react";
import { adjacent, crossword, solvedBoard, type Game } from "@/lib/games";

type Result = { score: number; elapsed: number; moves?: number; messageUrl: string };
type Entry = (typeof crossword.entries)[number];

const entries = crossword.entries;
const cellEntries = new Map<string, number[]>();
const cellNumbers = new Map<string, number>();
for (const entry of entries) {
  cellNumbers.set(`${entry.row}-${entry.col}`, entry.number);
  for (let i = 0; i < entry.word.length; i++) {
    const key = `${entry.row + (entry.direction === "down" ? i : 0)}-${entry.col + (entry.direction === "across" ? i : 0)}`;
    cellEntries.set(key, [...(cellEntries.get(key) || []), entry.number]);
  }
}

function keysForEntry(entry: Entry): string[] {
  return [...entry.word].map((_, i) => `${entry.row + (entry.direction === "down" ? i : 0)}-${entry.col + (entry.direction === "across" ? i : 0)}`);
}

function formatTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function Arcade({ gameId }: { gameId: string }) {
  const [game, setGame] = useState<Game | null>(null);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [board, setBoard] = useState<number[]>([]);
  const [moves, setMoves] = useState<number[]>([]);
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState(1);
  const [startedAt, setStartedAt] = useState(0);
  const [clock, setClock] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!startedAt || result) return;
    const interval = window.setInterval(() => setClock(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt, result]);

  async function startGame(nextGame: Game) {
    setLoading(true);
    setError("");
    setResult(null);
    setGame(nextGame);
    setToken("");
    setLetters({});
    setBoard([]);
    setMoves([]);
    setSelected(1);
    setClock(0);
    setStartedAt(0);
    try {
      const response = await fetch("/api/session", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game: nextGame }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start the game.");
      setToken(data.token);
      setBoard(data.board || []);
      setStartedAt(Date.now());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not start the game.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await fetch("/api/logout", { method: "POST" });
    window.location.assign("/");
  }

  async function submitScore() {
    if (!game || !token) return;
    if (!/^[\p{L}\p{N} _.-]{2,24}$/u.test(name.trim())) {
      setError("Enter a name of 2–24 letters or numbers first.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/score", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim(), ...(game === "crosswords" ? { letters } : { moves }) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not submit your score.");
      setResult(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not submit your score.");
    } finally {
      setSubmitting(false);
    }
  }

  function pickCell(key: string) {
    const choices = cellEntries.get(key) || [];
    setSelected((current) => choices.length > 1 && choices.includes(current) ? choices.find((value) => value !== current)! : choices[0]);
  }

  function writeLetter(key: string, value: string) {
    const letter = value.replace(/[^a-z]/gi, "").slice(-1).toUpperCase();
    setLetters((previous) => ({ ...previous, [key]: letter }));
    if (!letter) return;
    const entry = entries.find((candidate) => candidate.number === selected) || entries[0];
    const sequence = keysForEntry(entry);
    const next = sequence[sequence.indexOf(key) + 1];
    if (next) inputRefs.current[next]?.focus();
  }

  function keyDown(event: React.KeyboardEvent<HTMLInputElement>, key: string) {
    const entry = entries.find((candidate) => candidate.number === selected) || entries[0];
    const sequence = keysForEntry(entry);
    const index = sequence.indexOf(key);
    if (event.key === "Backspace" && !letters[key] && index > 0) {
      inputRefs.current[sequence[index - 1]]?.focus();
    }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      if (index >= 0 && index < sequence.length - 1) inputRefs.current[sequence[index + 1]]?.focus();
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      if (index > 0) inputRefs.current[sequence[index - 1]]?.focus();
    }
  }

  function slide(index: number) {
    if (result || !adjacent(board.indexOf(0)).includes(index)) return;
    const next = [...board];
    const blank = next.indexOf(0);
    [next[index], next[blank]] = [next[blank], next[index]];
    setBoard(next);
    setMoves((previous) => [...previous, index]);
  }

  const puzzleSolved = board.length === 9 && board.every((tile, index) => tile === solvedBoard[index]);
  const crosswordFilled = Object.keys(letters).filter((key) => letters[key] && cellEntries.has(key)).length;
  const completed = game === "crosswords" ? crosswordFilled === cellEntries.size : puzzleSolved;
  const currentEntry = entries.find((candidate) => candidate.number === selected) || entries[0];

  return (
    <main>
      <header className="site-header">
        <a href="/" className="brand" aria-label="Golden Spatula Arcade home"><span className="brand-mark">✦</span><span>GOLDEN SPATULA <strong>ARCADE</strong></span></a>
        <div className="header-actions"><span className="header-pill"><span className="live-dot" /> GAME ID: {gameId}</span><button type="button" onClick={signOut} className="signout">SIGN OUT</button></div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="small-star">✳</span> THE COMMUNITY PLAYGROUND <span className="line" /></div>
          <h1>YOUR NEXT <em>GOLDEN</em><br />MOMENT STARTS HERE<span className="period">.</span></h1>
          <p>Pick a game, put your skills to the test, and send your winning score straight to the community.</p>
          <div className="hero-tags"><span>✦ CROSSWORDS</span><span>✦ SLIDING PUZZLE</span><span>✦ DISCORD SCORES</span></div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><img className="hero-spatula" src="/spatula.svg" alt="" /><span className="float-star star-one">✦</span><span className="float-star star-two">✧</span><span className="float-star star-three">✳</span><span className="hero-art-caption">READY, SET, PLAY!</span></div>
      </section>

      <section className="content" id="games">
        <div className="section-title"><div><span className="overline">01 / THE GAMES</span><h2>Choose your challenge<span className="period">.</span></h2></div><span className="side-note">TWO WAYS TO WIN ↘</span></div>
        <div className="game-cards">
          <button type="button" className={`game-card crossword-card ${game === "crosswords" ? "active" : ""}`} onClick={() => startGame("crosswords") }>
            <div className="card-top"><span className="card-index">GAME 01</span><span className="card-arrow">↗</span></div>
            <div className="crossword-icon" aria-hidden="true"><span>G</span><span>O</span><span>L</span><span>D</span><span>★</span><span>?</span><span>?</span><span>?</span><span>?</span></div>
            <div><span className="card-kind">WORD GAME · 8 CLUES</span><h3>GOLDEN SPATULA<br />CROSSWORDS</h3><p>Fill the grid with words from the arena. Every clue gets you closer to the crown.</p></div>
            <span className="card-cta">PLAY CROSSWORDS <span>→</span></span>
          </button>
          <button type="button" className={`game-card puzzle-card ${game === "puzzle" ? "active" : ""}`} onClick={() => startGame("puzzle") }>
            <div className="card-top"><span className="card-index">GAME 02</span><span className="card-arrow">↗</span></div>
            <div className="puzzle-icon" aria-hidden="true"><span>✦</span><span>✧</span><span>◈</span><span>◆</span></div>
            <div><span className="card-kind">SLIDING GAME · 9 TILES</span><h3>GOLDEN SPATULA<br />PUZZLE</h3><p>Slide the tiles back into place. Find the picture and beat the clock.</p></div>
            <span className="card-cta">PLAY PUZZLE <span>→</span></span>
          </button>
        </div>

        {game && <section className="play-area" aria-live="polite">
          <div className="play-heading"><div><span className="overline">02 / NOW PLAYING</span><h2>{game === "crosswords" ? "Golden Spatula Crosswords" : "Golden Spatula Puzzle"}</h2></div><button type="button" className="text-button" onClick={() => startGame(game)}>↻ NEW GAME</button></div>
          <div className="play-meta"><span>⏱ TIME <strong>{formatTime(clock)}</strong></span><span>{game === "crosswords" ? `▦ FILLED ${crosswordFilled}/${cellEntries.size}` : `↗ MOVES ${moves.length}`}</span></div>
          {loading ? <div className="loading">SETTING UP YOUR GAME…</div> : token && <>
            {game === "crosswords" ? <div className="crossword-layout">
              <div className="grid-wrap"><div className="crossword-grid" role="group" aria-label="Crossword grid">
                {Array.from({ length: crossword.rows * crossword.cols }, (_, index) => {
                  const row = Math.floor(index / crossword.cols);
                  const col = index % crossword.cols;
                  const key = `${row}-${col}`;
                  const choices = cellEntries.get(key);
                  if (!choices) return <div key={key} className="empty-cell" aria-hidden="true" />;
                  return <div key={key} className={`letter-cell ${choices.includes(selected) ? "highlight" : ""}`}>
                    {cellNumbers.has(key) && <span className="cell-number">{cellNumbers.get(key)}</span>}
                    <input ref={(element) => { inputRefs.current[key] = element; }} value={letters[key] || ""} onChange={(event) => writeLetter(key, event.target.value)} onFocus={() => { if (!choices.includes(selected)) setSelected(choices[0]); }} onClick={() => pickCell(key)} onKeyDown={(event) => keyDown(event, key)} aria-label={`Row ${row + 1}, column ${col + 1}${cellNumbers.has(key) ? `, clue ${cellNumbers.get(key)}` : ""}`} maxLength={1} autoComplete="off" spellCheck={false} />
                  </div>;
                })}
              </div><p className="grid-hint">TIP: TAP AN INTERSECTION TO SWITCH BETWEEN CLUES</p></div>
              <div className="clues"><div className="clue-spotlight"><span>CURRENT CLUE · {currentEntry.direction.toUpperCase()}</span><strong>{currentEntry.number}. {currentEntry.clue}</strong></div>
                {(["across", "down"] as const).map((direction) => <div className="clue-group" key={direction}><h4>{direction.toUpperCase()} <span>↗</span></h4>{entries.filter((entry) => entry.direction === direction).map((entry) => <button type="button" key={entry.number} className={`clue ${selected === entry.number ? "selected" : ""}`} onClick={() => { setSelected(entry.number); inputRefs.current[keysForEntry(entry)[0]]?.focus(); }}><b>{String(entry.number).padStart(2, "0")}</b><span>{entry.clue}</span></button>)}</div>)}
              </div>
            </div> : <div className="puzzle-layout"><div className="puzzle-grid" role="group" aria-label="Sliding tile puzzle">{board.map((tile, index) => <button type="button" key={tile} disabled={tile === 0 || !adjacent(board.indexOf(0)).includes(index) || !!result} className={`puzzle-tile ${tile === 0 ? "tile-empty" : ""}`} onClick={() => slide(index)} aria-label={tile === 0 ? "Empty space" : `Tile ${tile}${adjacent(board.indexOf(0)).includes(index) ? ", move into empty space" : ""}`} style={tile ? { backgroundPosition: `${((tile - 1) % 3) * 50}% ${Math.floor((tile - 1) / 3) * 50}%` } : undefined}>{tile > 0 && <span>{tile}</span>}</button>)}</div><div className="puzzle-instructions"><span className="overline">HOW TO PLAY</span><h3>Piece it<br /><em>together.</em></h3><p>Tap a tile next to the empty square to slide it. Arrange all eight tiles in order to complete the Golden Spatula artwork.</p><div className="goal-preview"><img src="/puzzle-art.svg" alt="Completed Golden Spatula puzzle artwork" /><span>YOUR TARGET IMAGE ↗</span></div></div></div>}

            <div className="score-panel"><div><span className="overline">03 / CLAIM YOUR SCORE</span><h3>{result ? "A golden finish!" : completed ? "Ready to claim your score?" : "Finish the game to unlock your score"}</h3><p>{result ? "Your completed score has been posted to Discord." : "Use a player name so everyone knows who solved it. Names are entered by players and are not verified Discord accounts."}</p></div>
              {result ? <div className="result"><strong>{result.score.toLocaleString("en-US")}</strong><span>POINTS · {formatTime(result.elapsed)}{result.moves ? ` · ${result.moves} MOVES` : ""}</span><a href={result.messageUrl} target="_blank" rel="noopener noreferrer">VIEW DISCORD SCORE ↗</a></div> : <form onSubmit={(event) => { event.preventDefault(); submitScore(); }} className="score-form"><label htmlFor="player-name">PLAYER NAME</label><input id="player-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="Your name" autoComplete="nickname" /><button type="submit" disabled={!completed || submitting}>{submitting ? "POSTING SCORE…" : "SEND SCORE TO DISCORD →"}</button></form>}
            </div>
          </>}
          {error && <p className="error" role="alert">{error}</p>}
        </section>}
      </section>
      <footer><span className="brand"><span className="brand-mark">✦</span> GOLDEN SPATULA ARCADE</span><span>PLAY WELL. WIN GOLD. ✳</span></footer>
    </main>
  );
}
