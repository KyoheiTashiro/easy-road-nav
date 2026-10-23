import { useEffect } from "react";
import { tripActions, useTrip } from "@/store/trip.ts";

/** 重複排除と反映は store 側 */
export function useReverseGeocode(): void {
  const from = useTrip((state) => state.from);
  const to = useTrip((state) => state.to);
  const vias = useTrip((state) => state.vias);

  useEffect(() => {
    for (const point of [from, to, ...vias]) {
      if (point && point.label === null) tripActions.labelRequested(point);
    }
  }, [from, to, vias]);
}
