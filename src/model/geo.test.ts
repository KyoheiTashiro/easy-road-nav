import { describe, expect, it } from "vitest";
import { bearing, destination, haversine, projectToSegment } from "./geo.ts";

const tokyo = { lat: 35.6812, lng: 139.7671 }; // 東京駅
const osaka = { lat: 34.7025, lng: 135.4959 }; // 大阪駅

describe("haversine", () => {
  it("既知の 2 点間距離（東京駅–大阪駅 ≈ 403 km）", () => {
    expect(haversine(tokyo, osaka)).toBeCloseTo(403_000, -4);
  });
  it("同一点は 0", () => {
    expect(haversine(tokyo, tokyo)).toBe(0);
  });
  it("緯度 1 度 ≈ 111.2 km", () => {
    expect(haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2);
  });
});

describe("bearing", () => {
  it.each([
    [{ lat: 1, lng: 0 }, 0],
    [{ lat: 0, lng: 1 }, 90],
    [{ lat: -1, lng: 0 }, 180],
    [{ lat: 0, lng: -1 }, 270],
  ])("原点 → %o は %d 度", (b, deg) => {
    expect(bearing({ lat: 0, lng: 0 }, b)).toBeCloseTo(deg, 6);
  });
});

describe("destination", () => {
  it("北へ 1000 m 進むと haversine が 1000、方位 0", () => {
    const d = destination(tokyo, 0, 1000);
    expect(haversine(tokyo, d)).toBeCloseTo(1000, 3);
    expect(bearing(tokyo, d)).toBeCloseTo(0, 6);
    expect(d.lng).toBeCloseTo(tokyo.lng, 9);
  });
  it("東へ進むと経度だけ増える", () => {
    const d = destination(tokyo, 90, 500);
    expect(d.lng).toBeGreaterThan(tokyo.lng);
    expect(haversine(tokyo, d)).toBeCloseTo(500, 3);
  });
});

describe("projectToSegment", () => {
  const a = { lat: 35.0, lng: 139.0 };
  const b = { lat: 35.0, lng: 139.01 }; // 東へ約 912 m
  it("中点は t 0.5、dist 0", () => {
    const r = projectToSegment({ lat: 35.0, lng: 139.005 }, a, b);
    expect(r.t).toBeCloseTo(0.5, 6);
    expect(r.dist).toBeCloseTo(0, 6);
  });
  it("線分の手前は t 0 にクランプ、dist は a までの距離", () => {
    const p = { lat: 35.0, lng: 138.99 };
    const r = projectToSegment(p, a, b);
    expect(r.t).toBe(0);
    expect(r.dist).toBeCloseTo(haversine(p, a), 0);
  });
  it("線分の先は t 1 にクランプ", () => {
    const p = { lat: 35.0, lng: 139.02 };
    const r = projectToSegment(p, a, b);
    expect(r.t).toBe(1);
    expect(r.dist).toBeCloseTo(haversine(p, b), 0);
  });
  it("横にずれた点は垂線距離", () => {
    const p = { lat: 35.001, lng: 139.005 }; // 北へ約 111 m
    const r = projectToSegment(p, a, b);
    expect(r.t).toBeCloseTo(0.5, 6);
    expect(r.dist).toBeCloseTo(111.2, 0);
  });
  it("長さ 0 の線分は t 0", () => {
    expect(projectToSegment(b, a, a).t).toBe(0);
  });
});
