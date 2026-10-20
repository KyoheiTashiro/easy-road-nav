import { useEffect } from "react";
import { useTrip } from "@/store/trip.ts";
import { buildQuery } from "@/model/url.ts";

/** URL が正（map-display.md） */
export function useUrlSync(): void {
  const from = useTrip((s) => s.from);
  const to = useTrip((s) => s.to);
  const vias = useTrip((s) => s.vias);
  const notoll = useTrip((s) => s.notoll);
  useEffect(() => {
    history.replaceState(null, "", buildQuery({ from, to, vias, notoll }) || location.pathname);
  }, [from, to, vias, notoll]);
}
