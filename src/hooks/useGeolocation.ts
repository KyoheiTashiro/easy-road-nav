import { useEffect } from "react";
import { navActions } from "@/store/nav.ts";
import { tripActions } from "@/store/trip.ts";

/** 失敗時も fix は前回値を保持 */
export function useGeolocation(): void {
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          t: pos.timestamp,
        };
        tripActions.fixUpdated(fix);
        navActions.onFix(fix);
      },
      () => tripActions.gpsFailed(),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
}
