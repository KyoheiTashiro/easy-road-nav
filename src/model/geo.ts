import type { LatLng } from "@/model/route.ts";

const R = 6371008.8; // m
const RAD = Math.PI / 180;

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** initial bearing、北 0・時計回り、[0, 360) */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = a.lat * RAD;
  const φ2 = b.lat * RAD;
  const dλ = (b.lng - a.lng) * RAD;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

export function destination(p: LatLng, bearingDeg: number, dist: number): LatLng {
  const φ1 = p.lat * RAD;
  const λ1 = p.lng * RAD;
  const θ = bearingDeg * RAD;
  const δ = dist / R;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / RAD, lng: ((λ2 / RAD + 540) % 360) - 180 };
}

/** 局所平面近似で p を線分 ab に射影。t は [0, 1] にクランプ、dist は射影点までの m */
export function projectToSegment(p: LatLng, a: LatLng, b: LatLng): { t: number; dist: number } {
  const k = R * RAD;
  const cos = Math.cos(a.lat * RAD);
  const bx = (b.lng - a.lng) * cos * k;
  const by = (b.lat - a.lat) * k;
  const px = (p.lng - a.lng) * cos * k;
  const py = (p.lat - a.lat) * k;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (px * bx + py * by) / len2));
  const dx = px - t * bx;
  const dy = py - t * by;
  return { t, dist: Math.hypot(dx, dy) };
}
