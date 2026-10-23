import { useEffect } from "react";
import { navigationActions } from "@/store/navigation.ts";
import { tripActions } from "@/store/trip.ts";

/** 失敗時も fix は前回値を保持 */
export function useGeolocation(): void {
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const fix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        tripActions.fixUpdated(fix);
        navigationActions.onFix(fix);
      },
      () => tripActions.gpsFailed(),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
}
