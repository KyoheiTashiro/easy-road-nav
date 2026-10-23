import { useEffect } from "react";
import { useTrip } from "@/store/trip.ts";
import { buildQuery } from "@/model/url.ts";

/** URL が正（map-display.md） */
export function useUrlSync(): void {
  const from = useTrip((state) => state.from);
  const to = useTrip((state) => state.to);
  const vias = useTrip((state) => state.vias);
  const notoll = useTrip((state) => state.notoll);

  useEffect(() => {
    history.replaceState(null, "", buildQuery({ from, to, vias, notoll }) || location.pathname);
  }, [from, to, vias, notoll]);
}
