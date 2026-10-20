/**
 * speechSynthesis の薄いラッパ。キューはブラウザ内蔵のものを使う（speak は順に再生される）。
 * - 同一文字列: まだ再生・待機中の直前文字列と同じなら捨てる（再生し終えた後の再発話は許す）
 * - unlock: iOS Safari はユーザー操作内の speak が必要。「案内開始」の click 内で空発話する
 * - ミュートは nav store 側で判定する（ここには来ない）
 * - speechSynthesis 非対応環境では全て no-op
 */
const ok = typeof speechSynthesis !== "undefined";
let last: string | null = null;

export function speak(text: string): void {
  if (!ok || text === last) return;
  last = text;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 1;
  u.onend = u.onerror = () => {
    if (last === text) last = null;
  };
  speechSynthesis.speak(u);
}

export function cancel(): void {
  last = null;
  if (ok) speechSynthesis.cancel();
}

export function unlock(): void {
  if (ok) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}
