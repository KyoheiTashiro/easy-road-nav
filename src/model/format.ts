export function formatDuration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} 分`;
  return m === 0 ? `${h} 時間` : `${h} 時間 ${m} 分`;
}

export function formatKm(m: number): string {
  return `${(m / 1000).toFixed(1)} km`;
}

export function formatDistance(m: number): string {
  const r = Math.round(m / 10) * 10;
  return r >= 1000 ? `${(r / 1000).toFixed(1)} km` : `${r} m`;
}

export function formatSpokenDistance(m: number): string {
  const r = Math.round(m / 100) * 100;
  if (r < 1000) return `${r} メートル`;
  return `${(r / 1000).toFixed(1).replace(/\.0$/, "")} キロ`;
}

export function formatClock(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
