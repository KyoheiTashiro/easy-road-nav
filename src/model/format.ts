/** "1 時間 20 分" / "25 分"。1 分未満は "1 分" */
export function formatDuration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} 分`;
  return m === 0 ? `${h} 時間` : `${h} 時間 ${m} 分`;
}

/** "12.3 km"（0.1 km 単位） */
export function formatKm(m: number): string {
  return `${(m / 1000).toFixed(1)} km`;
}

/** HUD: 10 m 単位。丸め後 1000 以上は "1.2 km" */
export function formatDistance(m: number): string {
  const r = Math.round(m / 10) * 10;
  return r >= 1000 ? `${(r / 1000).toFixed(1)} km` : `${r} m`;
}

/** 発話: 100 m 単位。丸め後 1000 以上は 0.1 km 単位 "1.2 キロ"（"1.0" は "1"） */
export function formatSpokenDistance(m: number): string {
  const r = Math.round(m / 100) * 100;
  if (r < 1000) return `${r} メートル`;
  return `${(r / 1000).toFixed(1).replace(/\.0$/, "")} キロ`;
}

/** "HH:MM" */
export function formatClock(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
