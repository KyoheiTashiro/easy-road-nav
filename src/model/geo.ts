import type { LatLng } from "@/model/point.ts";

const EARTH_RADIUS = 6371008.8; // m
const RADIANS_PER_DEGREE = Math.PI / 180;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * RADIANS_PER_DEGREE;
  const dLng = (b.lng - a.lng) * RADIANS_PER_DEGREE;
  const haversineTerm =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RADIANS_PER_DEGREE) *
      Math.cos(b.lat * RADIANS_PER_DEGREE) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(haversineTerm));
}

/** initial bearing、北 0・時計回り、[0, 360) */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = a.lat * RADIANS_PER_DEGREE;
  const φ2 = b.lat * RADIANS_PER_DEGREE;
  const dλ = (b.lng - a.lng) * RADIANS_PER_DEGREE;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) / RADIANS_PER_DEGREE + 360) % 360;
}

export function destination(point: LatLng, bearingDeg: number, distance: number): LatLng {
  const φ1 = point.lat * RADIANS_PER_DEGREE;
  const λ1 = point.lng * RADIANS_PER_DEGREE;
  const θ = bearingDeg * RADIANS_PER_DEGREE;
  const δ = distance / EARTH_RADIUS;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / RADIANS_PER_DEGREE, lng: ((λ2 / RADIANS_PER_DEGREE + 540) % 360) - 180 };
}

/** 局所平面近似で point を線分 ab に射影。t は [0, 1] にクランプ、distance は射影点までの m */
export function projectToSegment(
  point: LatLng,
  a: LatLng,
  b: LatLng,
): { t: number; distance: number } {
  const metersPerDegree = EARTH_RADIUS * RADIANS_PER_DEGREE;
  const cosineLatitude = Math.cos(a.lat * RADIANS_PER_DEGREE);
  const bx = (b.lng - a.lng) * cosineLatitude * metersPerDegree;
  const by = (b.lat - a.lat) * metersPerDegree;
  const px = (point.lng - a.lng) * cosineLatitude * metersPerDegree;
  const py = (point.lat - a.lat) * metersPerDegree;
  const lengthSquared = bx * bx + by * by;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (px * bx + py * by) / lengthSquared));
  const dx = px - t * bx;
  const dy = py - t * by;
  return { t, distance: Math.hypot(dx, dy) };
}
