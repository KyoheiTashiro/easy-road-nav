import { useGeolocation } from "@/hooks/useGeolocation.ts";
import { useReverseGeocode } from "@/hooks/useReverseGeocode.ts";
import { useRouteSearch } from "@/hooks/useRouteSearch.ts";
import { useUpdateCheck } from "@/hooks/useUpdateCheck.ts";
import { useUrlSync } from "@/hooks/useUrlSync.ts";
import { useWakeLock } from "@/hooks/useWakeLock.ts";
import type { ReactElement } from "react";
import { MODE, useTrip, type Mode } from "@/store/trip.ts";
import { BottomSheet } from "@/ui/edit/BottomSheet.tsx";
import { Settings } from "@/ui/edit/Settings.tsx";
import { Map } from "@/ui/map/Map.tsx";
import { NavigationBar } from "@/ui/navigation/NavigationBar.tsx";
import { NavigationHud } from "@/ui/navigation/NavigationHud.tsx";
import { SearchBox } from "@/ui/edit/SearchBox.tsx";
import { Toast } from "@/ui/Toast.tsx";

function screenOf(mode: Mode): ReactElement {
  switch (mode) {
    case MODE.NAVIGATION:
      return (
        <>
          <NavigationHud />
          <NavigationBar />
        </>
      );
    case MODE.SETTINGS:
      return <Settings />;
    case MODE.HOME:
      return <SearchBox key={mode} />; // key: モード切替で入力 state を捨てる
    case MODE.EDIT:
      return (
        <>
          <SearchBox key={mode} />
          <BottomSheet />
        </>
      );
  }
}

/** 外部システムとの同期（hooks/）とレイアウトだけ。状態は store/、各部品が自分で購読する */
export default function App() {
  useGeolocation();
  useRouteSearch();
  useReverseGeocode();
  useUrlSync();
  const mode = useTrip((state) => state.mode);
  useWakeLock(mode === MODE.NAVIGATION);
  useUpdateCheck(mode === MODE.NAVIGATION);

  return (
    <>
      <Map />
      {screenOf(mode)}
      <Toast />
    </>
  );
}
