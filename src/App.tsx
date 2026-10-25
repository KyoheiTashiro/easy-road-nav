import { useGeolocation } from "@/trip/useGeolocation.ts";
import { useReverseGeocode } from "@/search/useReverseGeocode.ts";
import { useRouteSearch } from "@/route/useRouteSearch.ts";
import { useUpdateCheck } from "@/shared/useUpdateCheck.ts";
import { useUrlSync } from "@/trip/useUrlSync.ts";
import { useWakeLock } from "@/navigation/useWakeLock.ts";
import type { ReactElement } from "react";
import { MODE, useTrip, type Mode } from "@/trip/trip.ts";
import { BottomSheet } from "@/sheet/BottomSheet.tsx";
import { Settings } from "@/settings/Settings.tsx";
import { Map } from "@/map/Map.tsx";
import { NavigationBar } from "@/navigation/NavigationBar.tsx";
import { NavigationHud } from "@/navigation/NavigationHud.tsx";
import { SearchBox } from "@/search/SearchBox.tsx";
import { Toast } from "@/shared/Toast.tsx";

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
    case MODE.HOME_SETUP:
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

/** 外部システムとの同期とレイアウトだけ。状態は各機能の store、各部品が自分で購読する */
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
      <Toast navigationMode={mode === MODE.NAVIGATION} />
    </>
  );
}
