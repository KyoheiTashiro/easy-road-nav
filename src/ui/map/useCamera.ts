import * as maplibregl from "maplibre-gl";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { NavigationState } from "@/model/progress.ts";
import { navigationActions, useNavigation } from "@/store/navigation.ts";
import { useSaved } from "@/store/saved.ts";
import { MODE, URL_HAD_POINTS, selectRoutes, useTrip } from "@/store/trip.ts";
import { layout } from "@/ui/layout.stylex.ts";
import { bounds } from "@/ui/map/mapLayers.ts";

/** ナビ中のカメラ pitch（navigation.md「カメラ」節。zoom は store/navigation.ts の NAVIGATION_ZOOM） */
export const NAVIGATION_PITCH = 50;

export const LOCATE_ZOOM = 15;

/** モード切替・追従・fitBounds・自宅や検索候補への移動と、それに伴うジェスチャ制限・コンパス */
export function useCamera(map: maplibregl.Map | null): void {
  const mode = useTrip((state) => state.mode);
  const navigation = useNavigation((state) => state.navigation);
  const home = useSaved((state) => state.home);
  const fix = useTrip((state) => state.fix);
  const routes = useTrip(selectRoutes);
  const selected = useTrip((state) => state.selected);
  const fitVersion = useTrip((state) => state.fitVersion);
  const panTarget = useTrip((state) => state.panTarget);
  const sheetExpanded = useTrip((state) => state.sheetExpanded);
  // 方位アイコン（押下で北上）。ナビ中は heading 追従と衝突するので外す
  const [compass] = useState(
    () =>
      new maplibregl.NavigationControl({
        showZoom: false,
        showCompass: true,
        visualizePitch: true,
      }),
  );
  const easedToFix = useRef(false);

  const onMapDragStart = useEffectEvent(() => {
    if (mode === MODE.NAVIGATION) navigationActions.setFollow(false);
  });
  const onMapZoomEnd = useEffectEvent((zoom: number) => {
    if (mode === MODE.NAVIGATION) navigationActions.setZoom(zoom);
  });
  useEffect(() => {
    if (!map) return;
    const onDragStart = (event: maplibregl.MapLibreEvent<MouseEvent | TouchEvent | undefined>) => {
      const originalEvent = event.originalEvent;
      if (originalEvent && "touches" in originalEvent && originalEvent.touches.length > 1) return; // ピンチ中のパンは追従解除しない
      onMapDragStart();
    };
    const onZoomEnd = (
      event: maplibregl.MapLibreEvent<MouseEvent | TouchEvent | WheelEvent | undefined>,
    ) => {
      // originalEvent なし = easeTo 等プログラム由来
      if (event.originalEvent) onMapZoomEnd(map.getZoom());
    };
    map.on("dragstart", onDragStart);
    map.on("zoomend", onZoomEnd);
    return () => {
      map.off("dragstart", onDragStart);
      map.off("zoomend", onZoomEnd);
    };
  }, [map]);

  // 初回 fix: URL に地点があれば探索後の fitBounds を優先し easeTo しない
  useEffect(() => {
    if (map && fix && !easedToFix.current) {
      easedToFix.current = true;
      if (!URL_HAD_POINTS) map.easeTo({ center: fix, zoom: 15 });
    }
  }, [map, fix]);

  useEffect(() => {
    if (map && panTarget)
      map.easeTo({ center: panTarget, zoom: Math.max(map.getZoom(), LOCATE_ZOOM) });
  }, [map, panTarget]);

  // 自宅設定モードに入ったら登録済みの自宅へ（home の変更ではカメラを動かさない）
  const easeToHome = useEffectEvent((map: maplibregl.Map) => {
    if (home) map.easeTo({ center: home, zoom: 15 });
  });
  // ナビ開始・終了: ジェスチャ制限とパディング（現在地を画面下 1/3 に置く）。fitVersion effect より前に置く
  useEffect(() => {
    if (!map) return;
    if (mode === MODE.NAVIGATION) {
      map.touchZoomRotate.disableRotation();
      map.touchPitch.disable();
      map.dragRotate.disable();
      if (map.hasControl(compass)) map.removeControl(compass);
      const containerHeight = map.getContainer().clientHeight;
      map.jumpTo({
        pitch: NAVIGATION_PITCH,
        padding: {
          top: Math.round(containerHeight / 3),
          bottom: layout.navigationBar,
          left: 0,
          right: 0,
        },
      });
    } else {
      map.touchZoomRotate.enableRotation();
      map.touchPitch.enable();
      map.dragRotate.enable();
      if (!map.hasControl(compass)) map.addControl(compass, "top-left");
      map.jumpTo({ bearing: 0, pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
    }
    if (mode === MODE.HOME_SETUP) easeToHome(map);
  }, [map, mode, compass]);

  // 追従: navigation が更新されるたび（= 受理した fix ごと・follow/zoom 変更）に easeTo。heading null なら bearing 据え置き。
  // fix は navigation と同時に更新されるので依存にしない（二重 easeTo 防止）
  const followFix = useEffectEvent((map: maplibregl.Map, navigationState: NavigationState) => {
    if (!fix) return;
    map.easeTo({
      center: fix,
      zoom: navigationState.zoom,
      bearing: navigationState.heading ?? map.getBearing(),
      duration: 600,
    });
  });
  useEffect(() => {
    if (map && mode === MODE.NAVIGATION && navigation?.follow) followFix(map, navigation);
  }, [map, navigation, mode]);

  // 選択経路に fitBounds。下パディングはシートの高さに追従。selected は意図的に依存にしない: 代替切替でカメラを動かさない（ui.md「探索」）
  const fitSelected = useEffectEvent(() => {
    const route = routes[selected];
    if (!route || !map || mode !== MODE.EDIT) return;
    const sheet = sheetExpanded
      ? Math.round((map.getContainer().clientHeight * layout.half) / 100)
      : layout.peek;
    map.fitBounds(bounds(route), { padding: { top: 40, left: 40, right: 40, bottom: sheet + 40 } });
  });
  useEffect(() => {
    if (fitVersion > 0) fitSelected();
  }, [fitVersion]);
  // シート開閉で見える範囲が変わるので収め直す
  useEffect(() => {
    fitSelected();
  }, [sheetExpanded]);
}
