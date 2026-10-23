import { describe, expect, it } from "vitest";
import { bearing, destination, haversine, projectToSegment } from "@/model/geo.ts";

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
    const point = destination(tokyo, 0, 1000);
    expect(haversine(tokyo, point)).toBeCloseTo(1000, 3);
    expect(bearing(tokyo, point)).toBeCloseTo(0, 6);
    expect(point.lng).toBeCloseTo(tokyo.lng, 9);
  });
  it("東へ進むと経度だけ増える", () => {
    const point = destination(tokyo, 90, 500);
    expect(point.lng).toBeGreaterThan(tokyo.lng);
    expect(haversine(tokyo, point)).toBeCloseTo(500, 3);
  });
});

describe("projectToSegment", () => {
  const a = { lat: 35.0, lng: 139.0 };
  const b = { lat: 35.0, lng: 139.01 }; // 東へ約 912 m
  it("中点は t 0.5、distance 0", () => {
    const projection = projectToSegment({ lat: 35.0, lng: 139.005 }, a, b);
    expect(projection.t).toBeCloseTo(0.5, 6);
    expect(projection.distance).toBeCloseTo(0, 6);
  });
  it("線分の手前は t 0 にクランプ、distance は a までの距離", () => {
    const point = { lat: 35.0, lng: 138.99 };
    const projection = projectToSegment(point, a, b);
    expect(projection.t).toBe(0);
    expect(projection.distance).toBeCloseTo(haversine(point, a), 0);
  });
  it("線分の先は t 1 にクランプ", () => {
    const point = { lat: 35.0, lng: 139.02 };
    const projection = projectToSegment(point, a, b);
    expect(projection.t).toBe(1);
    expect(projection.distance).toBeCloseTo(haversine(point, b), 0);
  });
  it("横にずれた点は垂線距離", () => {
    const point = { lat: 35.001, lng: 139.005 }; // 北へ約 111 m
    const projection = projectToSegment(point, a, b);
    expect(projection.t).toBeCloseTo(0.5, 6);
    expect(projection.distance).toBeCloseTo(111.2, 0);
  });
  it("長さ 0 の線分は t 0", () => {
    expect(projectToSegment(b, a, a).t).toBe(0);
  });
});
