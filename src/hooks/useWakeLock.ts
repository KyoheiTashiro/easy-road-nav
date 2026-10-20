import { useEffect } from "react";

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const request = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (released) l.release();
          else lock = l;
        })
        .catch(() => {}); // 低電力モード等で拒否される。致命的でない
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release();
    };
  }, [active]);
}
