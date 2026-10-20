import { useGeolocation } from "@/hooks/useGeolocation.ts";
import { useReverseGeocode } from "@/hooks/useReverseGeocode.ts";
import { useRouteSearch } from "@/hooks/useRouteSearch.ts";
import { useUpdateCheck } from "@/hooks/useUpdateCheck.ts";
import { useUrlSync } from "@/hooks/useUrlSync.ts";
import { useWakeLock } from "@/hooks/useWakeLock.ts";
import { MODE, useTrip } from "@/store/trip.ts";
import { BottomSheet } from "@/ui/edit/BottomSheet.tsx";
import { Map } from "@/ui/map/Map.tsx";
import { NavBar } from "@/ui/nav/NavBar.tsx";
import { NavHud } from "@/ui/nav/NavHud.tsx";
import { SearchBox } from "@/ui/edit/SearchBox.tsx";
import { Toast } from "@/ui/Toast.tsx";

/** 外部システムとの同期（hooks/）とレイアウトだけ。状態は store/、各部品が自分で購読する */
export default function App() {
  useGeolocation();
  useRouteSearch();
  useReverseGeocode();
  useUrlSync();
  const mode = useTrip((s) => s.mode);
  useWakeLock(mode === MODE.NAV);
  useUpdateCheck(mode === MODE.NAV);

  return (
    <>
      <Map />
      {mode === MODE.NAV ? (
        <>
          <NavHud />
          <NavBar />
        </>
      ) : (
        <>
          <SearchBox key={mode} /> {/* モード切替で入力 state を捨てる */}
          {mode === MODE.EDIT && <BottomSheet />}
        </>
      )}
      <Toast />
    </>
  );
}
