import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDistance,
  formatDuration,
  formatKm,
  formatSpokenDistance,
} from "@/model/format.ts";

describe("formatDuration", () => {
  it.each([
    [0, "1 分"],
    [59_000, "1 分"],
    [25 * 60_000, "25 分"],
    [59.4 * 60_000, "59 分"],
    [60 * 60_000, "1 時間"],
    [80 * 60_000, "1 時間 20 分"],
    [150 * 60_000, "2 時間 30 分"],
  ])("%d ms → %s", (ms, s) => {
    expect(formatDuration(ms)).toBe(s);
  });
});

describe("formatKm", () => {
  it.each([
    [0, "0.0 km"],
    [999, "1.0 km"],
    [12_345, "12.3 km"],
  ])("%d m → %s", (m, s) => {
    expect(formatKm(m)).toBe(s);
  });
});

describe("formatDistance", () => {
  it.each([
    [0, "0 m"],
    [344, "340 m"],
    [345, "350 m"],
    [994, "990 m"],
    [999, "1.0 km"],
    [1000, "1.0 km"],
    [1234, "1.2 km"],
  ])("%d m → %s", (m, s) => {
    expect(formatDistance(m)).toBe(s);
  });
});

describe("formatSpokenDistance", () => {
  it.each([
    [40, "0 メートル"],
    [50, "100 メートル"],
    [300, "300 メートル"],
    [949, "900 メートル"],
    [950, "1 キロ"],
    [1000, "1 キロ"],
    [1200, "1.2 キロ"],
    [1249, "1.2 キロ"],
  ])("%d m → %s", (m, s) => {
    expect(formatSpokenDistance(m)).toBe(s);
  });
});

describe("formatClock", () => {
  it("HH:MM ゼロ埋め", () => {
    expect(formatClock(new Date(2026, 0, 1, 9, 5))).toBe("09:05");
    expect(formatClock(new Date(2026, 0, 1, 23, 59))).toBe("23:59");
  });
});
