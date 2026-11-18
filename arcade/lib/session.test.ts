import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, readSession } from "./session";

describe("signed game sessions", () => {
  beforeEach(() => { process.env.ARCADE_SIGNING_SECRET = "test-secret-with-at-least-thirty-two-characters"; vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-18T08:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); delete process.env.ARCADE_SIGNING_SECRET; });

  it("rejects tampering and expired games", () => {
    const { token, session } = createSession("puzzle", "123456789");
    expect(readSession(token)).toEqual(session);
    expect(readSession(`${token.slice(0, -2)}ab`)).toBeNull();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1);
    expect(readSession(token)).toBeNull();
  });
});
