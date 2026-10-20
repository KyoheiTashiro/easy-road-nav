import { useEffect } from "react";
import { tripActions, useTrip } from "../store/trip.ts";

/** label null の地点（URL 復元・現在地・地図タップ）を逆ジオ。重複排除と反映は store 側 */
export function useReverseGeocode(): void {
  const from = useTrip((s) => s.from);
  const to = useTrip((s) => s.to);
  const vias = useTrip((s) => s.vias);
  useEffect(() => {
    for (const p of [from, to, ...vias]) {
      if (p && p.label === null) tripActions.labelRequested(p);
    }
  }, [from, to, vias]);
}
