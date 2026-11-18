import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPin, createPlayerCookie, hashPin, normalizeGameId, readPlayerCookie, validPin } from "./player";

describe("arcade player entry", () => {
  beforeEach(() => {
    process.env.ARCADE_SIGNING_SECRET = "test-signing-secret-with-at-least-thirty-two-characters";
    process.env.ARCADE_PIN_PEPPER = "test-pepper-with-at-least-thirty-two-characters";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T09:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ARCADE_SIGNING_SECRET;
    delete process.env.ARCADE_PIN_PEPPER;
  });

  it("keeps Game IDs as text and requires exactly four PIN digits", () => {
    expect(normalizeGameId(" 00123456 ")).toBe("00123456");
    expect(normalizeGameId("=IMPORTXML(A1)")).toBeNull();
    expect(validPin("0123")).toBe(true);
    expect(validPin("12345")).toBe(false);
  });

  it("stores a salted hash and checks the PIN without storing its raw digits", () => {
    const a = hashPin("0123");
    const b = hashPin("0123");
    expect(a).not.toBe(b);
    expect(a).not.toContain("0123");
    expect(checkPin("0123", a)).toBe(true);
    expect(checkPin("1234", a)).toBe(false);
  });

  it("rejects altered and expired entry cookies", () => {
    const cookie = createPlayerCookie("00123456");
    expect(readPlayerCookie(cookie)).toBe("00123456");
    expect(readPlayerCookie(`${cookie.slice(0, -2)}ab`)).toBeNull();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(readPlayerCookie(cookie)).toBeNull();
  });
});
