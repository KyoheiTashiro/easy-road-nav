import { useEffect, useRef, useState } from "react";
import type { Fix } from "../model/route.ts";

/**
 * 起動時から常時 watchPosition。失敗で error = true（fix は前回値を保持）。成功で false に戻る。
 * onError は error の立ち上がりで 1 回だけ呼ぶ（連続失敗で連打しない）
 */
export function useGeolocation(onError: () => void): { fix: Fix | null; error: boolean } {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState(() => !navigator.geolocation);
  const errorRef = useRef(error);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          t: pos.timestamp,
        });
        errorRef.current = false;
        setError(false);
      },
      () => {
        if (!errorRef.current) onErrorRef.current();
        errorRef.current = true;
        setError(true);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return { fix, error };
}
