"use client";

import { useEffect, useRef, useState } from "react";
import { adjacent, crossword, puzzlePicture, puzzlePictures, solvedBoard, type Game, type PuzzlePicture, type PuzzlePictureId } from "@/lib/games";

type Result = { score: number; elapsed: number; moves?: number; messageUrl: string };
type Entry = (typeof crossword.entries)[number];
type Snapshot = { game: Game; token: string; state: { letters: Record<string, string> } | { moves: number[] }; revision: number; completed: boolean };

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

export default function Arcade({ gameId, playerName }: { gameId: string; playerName: string }) {
  const [game, setGame] = useState<Game | null>(null);
  const [pictureId, setPictureId] = useState<PuzzlePictureId>(1);
  const [pictures, setPictures] = useState<PuzzlePicture[]>([...puzzlePictures]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [pictureWarning, setPictureWarning] = useState("");
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
  const [sharing, setSharing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [points, setPoints] = useState(0);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const snapshotRef = useRef<Snapshot | null>(null);
  const exitingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/puzzle-pictures").then((response) => response.json()).then((data) => {
      if (!alive) return;
      if (Array.isArray(data.pictures)) setPictures(data.pictures);
      setNextBefore(data.nextBefore || null);
      setPictureWarning(data.warning || "");
    }).catch(() => { if (alive) setPictureWarning("Could not load pictures from the Discord channel."); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    snapshotRef.current = game && token ? { game, token, state: game === "crosswords" ? { letters } : { moves }, revision, completed: !!result } : null;
  }, [game, token, letters, moves, revision, result]);

  useEffect(() => {
    const snapshot = snapshotRef.current;
    if (!snapshot || snapshot.completed || snapshot.revision === 0) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/progress", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: snapshot.token, state: snapshot.state, revision: snapshot.revision }),
        });
        const data = await response.json();
        if (response.ok && snapshotRef.current?.token === snapshot.token && snapshotRef.current.revision === snapshot.revision) setPoints(data.points);
      } catch { /* Exit & Share retries with the latest state. */ }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [revision, token]);

  useEffect(() => {
    const onPageHide = () => {
      const snapshot = snapshotRef.current;
      if (!snapshot || snapshot.completed || exitingRef.current) return;
      const body = JSON.stringify({ token: snapshot.token, state: snapshot.state, revision: snapshot.revision });
      navigator.sendBeacon("/api/progress/exit", new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  async function loadMorePictures() {
    if (!nextBefore) return;
    try {
      const response = await fetch(`/api/puzzle-pictures?before=${encodeURIComponent(nextBefore)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load more pictures.");
      setPictures((previous) => [...previous, ...data.pictures.filter((item: PuzzlePicture) => !previous.some((existing) => existing.id === item.id))]);
      setNextBefore(data.nextBefore || null);
      setPictureWarning(data.warning || "");
    } catch { setPictureWarning("Could not load more pictures."); }
  }

  useEffect(() => {
    if (!startedAt || result) return;
    const interval = window.setInterval(() => setClock(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt, result]);

  async function saveCurrent(): Promise<boolean> {
    const snapshot = snapshotRef.current;
    if (!snapshot || snapshot.completed || snapshot.revision === 0) return true;
    try {
      const response = await fetch("/api/progress", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: snapshot.token, state: snapshot.state, revision: snapshot.revision }),
      });
      if (!response.ok) throw new Error("Could not save progress. Try again.");
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save progress.");
      return false;
    }
  }

  async function startGame(nextGame: Game, nextPictureId: PuzzlePictureId = 1, newGame = false) {
    if (!newGame && nextGame === game && token) {
      document.querySelector(".play-area")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (!await saveCurrent()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setGame(nextGame);
    if (nextGame === "puzzle") setPictureId(nextPictureId);
    setToken("");
    setLetters({});
    setBoard([]);
    setMoves([]);
    setSelected(1);
    setClock(0);
    setStartedAt(0);
    setRevision(0);
    setPoints(0);
    snapshotRef.current = null;
    exitingRef.current = false;
    try {
      let response: Response | null = !newGame ? await fetch(`/api/progress?game=${nextGame}`) : null;
      let data = response ? await response.json() : null;
      if (response && !response.ok) throw new Error(data.error || "Could not restore progress.");
      if (data?.progress) {
        const saved = data.progress;
        setToken(saved.token);
        setLetters(saved.state.letters || {});
        setMoves(saved.state.moves || []);
        setBoard(saved.board || []);
        setPictureId(saved.pictureId || 1);
        setRevision(saved.revision);
        setPoints(saved.points);
        setStartedAt(saved.startedAt);
        setClock(Math.floor((Date.now() - saved.startedAt) / 1000));
        return;
      }
      response = await fetch("/api/session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: nextGame, ...(nextGame === "puzzle" ? { pictureId: nextPictureId } : {}) }),
      });
      data = await response.json();
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
    if (!await exitAndShare(false)) return;
    await fetch("/api/logout", { method: "POST", headers: window.location.hostname.endsWith(".discordsays.com") ? { "X-Arcade-Activity": "1" } : {} });
    window.location.assign("/");
  }

  async function exitAndShare(close = true): Promise<boolean> {
    const snapshot = snapshotRef.current;
    if (!snapshot || snapshot.completed) {
      if (close && document.documentElement.classList.contains("discord-activity")) window.dispatchEvent(new Event("arcade:close"));
      return true;
    }
    setSharing(true);
    setError("");
    try {
      const response = await fetch("/api/progress/exit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: snapshot.token, state: snapshot.state, revision: snapshot.revision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not share your points.");
      exitingRef.current = true;
      setPoints(data.points ?? points);
      if (close) {
        if (document.documentElement.classList.contains("discord-activity")) window.dispatchEvent(new Event("arcade:close"));
        else { setGame(null); setToken(""); }
      }
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not share your points.");
      return false;
    } finally { setSharing(false); }
  }

  async function submitScore() {
    if (!game || !token) return;
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/score", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...(game === "crosswords" ? { letters } : { moves }) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not submit your score.");
      setResult(data);
      exitingRef.current = true;
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
    setRevision((current) => current + 1);
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
    setRevision((current) => current + 1);
  }

  const puzzleSolved = board.length === 9 && board.every((tile, index) => tile === solvedBoard[index]);
  const crosswordFilled = Object.keys(letters).filter((key) => letters[key] && cellEntries.has(key)).length;
  const clueStatuses = new Map(entries.map((entry) => {
    const answer = keysForEntry(entry).map((key) => letters[key] || "");
    return [entry.number, answer.every(Boolean) ? answer.join("") === entry.word ? "correct" : "incorrect" : "pending"] as const;
  }));
  const correctClues = [...clueStatuses.values()].filter((status) => status === "correct").length;
  const completed = game === "crosswords" ? correctClues === entries.length : puzzleSolved;
  const currentEntry = entries.find((candidate) => candidate.number === selected) || entries[0];
  const currentPicture = pictures.find((picture) => picture.id === pictureId) || puzzlePicture(pictureId);
  const pictureNumber = pictures.findIndex((picture) => picture.id === pictureId) + 1;

  return (
    <main>
      <header className="site-header">
        <a href="/" className="brand" aria-label="Golden Spatula Arcade home"><img className="brand-logo" src="/golden-spatula-logo.png" alt="" /><strong>ARCADE</strong></a>
        <div className="header-actions"><span className="header-pill"><span className="live-dot" /> {playerName} · GAME ID: {gameId}</span><button type="button" onClick={signOut} className="signout">SIGN OUT</button></div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="small-star">✳</span> THE COMMUNITY PLAYGROUND <span className="line" /></div>
          <h1>YOUR NEXT <em>GOLDEN</em><br />MOMENT STARTS HERE<span className="period">.</span></h1>
          <p>Pick a game, put your skills to the test, and send your winning score straight to the community.</p>
          <div className="hero-tags"><span>✦ CROSSWORDS</span><span>✦ SLIDING PUZZLE</span><span>✦ DISCORD SCORES</span></div>
        </div>
        <div className="hero-art" aria-hidden="true"><img className="hero-logo" src="/golden-spatula-logo.png" alt="" /><span className="float-star star-one">✦</span><span className="float-star star-two">✧</span><span className="float-star star-three">✳</span><span className="hero-art-caption">READY, SET, PLAY!</span></div>
      </section>

      <section className="content" id="games">
        <div className="section-title"><div><span className="overline">01 / THE GAMES</span><h2>Choose your challenge<span className="period">.</span></h2></div><span className="side-note">TWO WAYS TO WIN ↘</span></div>
        <div className="game-cards">
          <button type="button" className={`game-card crossword-card ${game === "crosswords" ? "active" : ""}`} onClick={() => startGame("crosswords") }>
            <div className="card-top"><span className="card-index">GAME 01</span><span className="card-arrow">↗</span></div>
            <img className="card-banner" src="/crossword-banner.webp" alt="Golden Spatula Crossword anniversary banner" />
            <div><span className="card-kind">WORD GAME · 8 CLUES</span><h3>GOLDEN SPATULA<br />CROSSWORDS</h3><p>Fill the grid with words from the arena. Every clue gets you closer to the crown.</p></div>
            <span className="card-cta">PLAY CROSSWORDS <span>→</span></span>
          </button>
          <button type="button" className={`game-card puzzle-card ${game === "puzzle" ? "active" : ""}`} onClick={() => startGame("puzzle") }>
            <div className="card-top"><span className="card-index">GAME 02</span><span className="card-arrow">↗</span></div>
            <img className="card-banner" src="/puzzle-banner.webp" alt="Golden Spatula Puzzle anniversary banner" />
            <div><span className="card-kind">SLIDING GAME · 9 TILES</span><h3>GOLDEN SPATULA<br />PUZZLE</h3><p>Slide the tiles back into place. Find the picture and beat the clock.</p></div>
            <span className="card-cta">PLAY PUZZLE <span>→</span></span>
          </button>
        </div>

        {game && <section className="play-area" aria-live="polite">
          <div className="play-heading"><div><span className="overline">02 / NOW PLAYING</span><h2>{game === "crosswords" ? "Golden Spatula Crosswords" : "Golden Spatula Puzzle"}</h2></div><button type="button" className="text-button" onClick={() => startGame(game, pictureId, true)}>↻ NEW GAME</button></div>
          <div className="play-meta"><span>⏱ TIME <strong>{formatTime(clock)}</strong></span><span>{game === "crosswords" ? `▦ FILLED ${crosswordFilled}/${cellEntries.size}` : `↗ MOVES ${moves.length}`}</span>{game === "crosswords" ? <span className="clue-progress" aria-live="polite">✓ CORRECT <strong>{correctClues}/{entries.length}</strong></span> : <span>IMAGE <strong>{pictureNumber || "–"}/{pictures.length}</strong></span>}<span>POINTS <strong>{points.toLocaleString("en-US")}</strong></span></div>
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
              <div className="clues"><div className="clue-spotlight"><span>CURRENT CLUE · {currentEntry.direction.toUpperCase()}</span><strong>{currentEntry.number}. {currentEntry.clue}</strong><small>{currentEntry.hint}</small><span className={`clue-state ${clueStatuses.get(currentEntry.number)}`}>{clueStatuses.get(currentEntry.number) === "correct" ? "✓ Correct answer" : clueStatuses.get(currentEntry.number) === "incorrect" ? "✕ Incorrect — try again" : "Fill every letter to check"}</span></div>
                {(["across", "down"] as const).map((direction) => <div className="clue-group" key={direction}><h4>{direction.toUpperCase()} <span>↗</span></h4>{entries.filter((entry) => entry.direction === direction).map((entry) => <button type="button" key={entry.number} className={`clue ${selected === entry.number ? "selected" : ""}`} onClick={() => { setSelected(entry.number); inputRefs.current[keysForEntry(entry)[0]]?.focus(); }}><b>{String(entry.number).padStart(2, "0")}</b><span className="clue-content"><strong>{entry.clue}</strong><small>{entry.hint}</small></span><span className={`clue-badge ${clueStatuses.get(entry.number)}`}>{clueStatuses.get(entry.number) === "correct" ? "✓ CORRECT" : clueStatuses.get(entry.number) === "incorrect" ? "✕ TRY AGAIN" : "IN PROGRESS"}</span></button>)}</div>)}
              </div>
            </div> : <div className="puzzle-layout">
              <div className="puzzle-grid" role="group" aria-label={`Sliding tile puzzle, ${currentPicture.label}`}>
                {board.map((tile, index) => <button type="button" key={tile} disabled={tile === 0 || !adjacent(board.indexOf(0)).includes(index) || !!result} className={`puzzle-tile ${tile === 0 ? "tile-empty" : ""}`} onClick={() => slide(index)} aria-label={tile === 0 ? "Empty space" : `Tile ${tile}${adjacent(board.indexOf(0)).includes(index) ? ", move into empty space" : ""}`} style={tile ? { backgroundImage: `url("${currentPicture.src}")`, backgroundPosition: `${((tile - 1) % 3) * 50}% ${Math.floor((tile - 1) / 3) * 50}%` } : undefined}>{tile > 0 && <span>{tile}</span>}</button>)}
              </div>
              <div className="puzzle-instructions">
                <span className="overline">PUZZLE PICTURES</span>
                <div className="picture-choices">{pictures.map((picture) => <button type="button" key={picture.id} className={`picture-choice ${picture.id === pictureId ? "selected" : ""}`} aria-pressed={picture.id === pictureId} onClick={() => startGame("puzzle", picture.id, true)}><img src={picture.src} alt="" /><span>{picture.label}</span></button>)}</div>
                {pictureWarning && <p className="picture-warning" role="status">{pictureWarning}</p>}
                {nextBefore && <button type="button" className="text-button load-pictures" onClick={loadMorePictures}>LOAD MORE PICTURES ↗</button>}
                <span className="overline">HOW TO PLAY</span><h3>Piece it<br /><em>together.</em></h3>
                <p>Tap a tile next to the empty square to slide it. Arrange all eight tiles in order to reveal the selected image.</p>
                <div className="goal-preview"><img src={currentPicture.src} alt={`Completed ${currentPicture.label} puzzle`} /><span>YOUR TARGET IMAGE ↗</span></div>
              </div>
            </div>}

            <div className="score-panel"><div><span className="overline">03 / SHARE YOUR POINTS</span><h3>{result ? "A golden finish!" : completed ? "Ready to claim your score?" : game === "crosswords" && crosswordFilled === cellEntries.size ? "Check your incorrect answers" : "Progress saved as you play"}</h3><p>{result ? "Your completed score has been posted to Discord." : `Playing as ${playerName}. Exit & Share posts your current points and saves this game, so you can continue next time. Closing the Discord window also tries to post automatically.`}</p></div>
              {result ? <div className="result"><strong>{result.score.toLocaleString("en-US")}</strong><span>POINTS · {formatTime(result.elapsed)}{result.moves ? ` · ${result.moves} MOVES` : ""}</span><a href={result.messageUrl} target="_blank" rel="noopener noreferrer">VIEW DISCORD SCORE ↗</a></div> : <div className="score-form"><span className="score-player-label">PLAYER</span><strong className="score-player">{playerName}</strong><button type="button" onClick={submitScore} disabled={!completed || submitting}>{submitting ? "POSTING SCORE…" : "SEND SCORE TO DISCORD →"}</button></div>}
            </div>
            {!result && <div className="exit-bar"><span>CURRENT POINTS: <strong>{points.toLocaleString("en-US")}</strong></span><button type="button" onClick={() => exitAndShare()} disabled={sharing || submitting}>{sharing ? "SHARING POINTS…" : "EXIT & SHARE CURRENT POINTS →"}</button></div>}
          </>}
          {error && <p className="error" role="alert">{error}</p>}
        </section>}
      </section>
      <footer><span className="brand"><img className="brand-logo" src="/golden-spatula-logo.png" alt="Golden Spatula" /> <strong>ARCADE</strong></span><span>PLAY WELL. WIN GOLD. ✳</span></footer>
    </main>
  );
}
