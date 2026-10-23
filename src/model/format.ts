export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} 分`;
  return minutes === 0 ? `${hours} 時間` : `${hours} 時間 ${minutes} 分`;
}

export function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDistance(meters: number): string {
  const rounded = Math.round(meters / 10) * 10;
  return rounded >= 1000 ? `${(rounded / 1000).toFixed(1)} km` : `${rounded} m`;
}

export function formatSpokenDistance(meters: number): string {
  const rounded = Math.round(meters / 100) * 100;
  if (rounded < 1000) return `${rounded} メートル`;
  return `${(rounded / 1000).toFixed(1).replace(/\.0$/, "")} キロ`;
}

export function formatClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
