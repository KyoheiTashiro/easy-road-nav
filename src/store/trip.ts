import { create } from "zustand";
import { PROFILE, type Profile } from "@/api/graphhopper.ts";
import { reverseGeocode } from "@/api/gsi.ts";
import { narrowSegments, type NarrowSegment } from "@/model/narrow.ts";
import {
  ROLE,
  type Fix,
  type LatLng,
  type PickRole,
  type Point,
  type PointRole,
  type Slot,
} from "@/model/point.ts";
import type { RouteModel } from "@/model/route.ts";
import { parseQuery } from "@/model/url.ts";
import { savedActions } from "@/store/saved.ts";
import { showToast } from "@/store/toast.ts";

// テスト（node）には location が無い
const INITIAL_QUERY = parseQuery(typeof location === "undefined" ? "" : location.search);
/** 初回 fix のカメラ（Map）: URL に地点が無ければ現在地へ easeTo。あれば探索後の fitBounds が優先 */
export const URL_HAD_POINTS = INITIAL_QUERY.from !== null || INITIAL_QUERY.to !== null;

export const MODE = {
  EDIT: "edit",
  NAVIGATION: "navigation",
  HOME_SETUP: "home",
  SETTINGS: "settings",
} as const;
export type Mode = (typeof MODE)[keyof typeof MODE];
/** 地図タップの地点ポップアップと、マーカータップの「削除」ポップアップ。1 つだけ開く。index は via のときだけ意味を持つ */
export type Popup =
  | { kind: "point"; point: LatLng; label: string | null }
  | { kind: "marker"; point: LatLng; role: PointRole; index: number };
type Result = {
  pointsKey: string;
  notoll: boolean;
  routes: RouteModel[];
  narrows: NarrowSegment[][];
};

export type TripState = {
  mode: Mode;
  from: Point | null;
  to: Point | null;
  vias: Point[];
  notoll: boolean;
  /** 探索結果 + 探索した地点集合と有料トグル。routes / loading は派生（selectRoutes / selectLoading） */
  result: Result | null;
  selected: number;
  fittedKey: string; // fitBounds 済みの地点集合キー。同じ地点集合の再探索（トグル・代替）ではカメラを動かさない
  fitVersion: number;
  sheetExpanded: boolean;
  popup: Popup | null;
  /** Map が easeTo する先（自宅設定の検索候補） */
  panTarget: LatLng | null;
  fix: Fix | null;
  gpsError: boolean;
  fromDefaulted: boolean; // 出発地の既定（初回 fix）を適用済み。URL に from があれば最初から true
  passedVia: number; // 通過済み経由地数（ナビの viaPassed で加算。地点の変更で 0）
};

const unlabeled = (point: LatLng | null): Point | null =>
  point ? { lat: point.lat, lng: point.lng, label: null } : null;

const useStore = create<TripState>(() => ({
  mode: MODE.EDIT,
  from: unlabeled(INITIAL_QUERY.from),
  to: unlabeled(INITIAL_QUERY.to),
  vias: INITIAL_QUERY.vias.map((point) => ({ ...point, label: null })),
  notoll: INITIAL_QUERY.notoll,
  result: null,
  selected: 0,
  fittedKey: "",
  fitVersion: 0,
  sheetExpanded: false,
  popup: null,
  panTarget: null,
  fix: null,
  gpsError: typeof navigator === "undefined" || !navigator.geolocation,
  fromDefaulted: INITIAL_QUERY.from !== null,
  passedVia: 0,
}));

export function useTrip<T>(selector: (state: TripState) => T): T {
  return useStore(selector);
}
/** async 関数・Map のイベントから最新値を読む（レンダー中には使わない） */
export const getTrip = useStore.getState;
const set = useStore.setState;

// ---- セレクタ（派生値。state には持たない）----

const NO_ROUTES: RouteModel[] = [];
const NO_NARROWS: NarrowSegment[][] = [];
const NO_NARROW: NarrowSegment[] = [];
const same = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;
const coordinateLabel = (point: LatLng) => `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
// 地点集合のキー（座標のみ。label 変化で再探索しない）
const keyOf = (points: (LatLng | null)[]) =>
  JSON.stringify(points.map((point) => point && [point.lat, point.lng]));
const complete = (state: TripState) => state.from !== null && state.to !== null;

export const selectPointsKey = (state: TripState): string =>
  keyOf([state.from, ...state.vias, state.to]);
export const selectProfile = (state: TripState): Profile =>
  state.notoll ? PROFILE.NOTOLL : PROFILE.CAR;
/** 地点が揃い、result が現在の地点集合と有料トグルで探索したものなときだけ結果。地点欠けで即空、探索中は旧結果を出さない */
function current(state: TripState): Result | null {
  const result = state.result;
  return result &&
    complete(state) &&
    result.pointsKey === selectPointsKey(state) &&
    result.notoll === state.notoll
    ? result
    : null;
}
export const selectRoutes = (state: TripState): RouteModel[] => current(state)?.routes ?? NO_ROUTES;
export const selectNarrows = (state: TripState): NarrowSegment[][] =>
  current(state)?.narrows ?? NO_NARROWS;
export const selectLoading = (state: TripState): boolean =>
  complete(state) && current(state) === null;
export const selectRoute = (state: TripState): RouteModel | undefined =>
  selectRoutes(state)[state.selected];
export const selectNarrow = (state: TripState): NarrowSegment[] =>
  selectNarrows(state)[state.selected] ?? NO_NARROW;

// ---- アクション ----

const resultOf = (pointsKey: string, notoll: boolean, routes: RouteModel[]): Result => ({
  pointsKey,
  notoll,
  routes,
  narrows: routes.map((route) => narrowSegments(route)),
});

/** 逆ジオ。失敗・海上は座標文字列にフォールバック（探索は止めない） */
async function resolveLabel(point: LatLng): Promise<string> {
  try {
    return (await reverseGeocode(point)) ?? coordinateLabel(point);
  } catch {
    return coordinateLabel(point);
  }
}
const pending = new Set<string>(); // 逆ジオ飛行中の座標キー（重複排除）

// 地点の変更。通過済み経由地数を戻し、地点が欠けたら次に揃ったとき fitBounds させる
function withPoints(state: TripState, patch: Partial<TripState>): Partial<TripState> {
  const next = { ...state, ...patch };
  return { ...patch, passedVia: 0, fittedKey: complete(next) ? state.fittedKey : "" };
}

export const tripActions = {
  pointSet(role: Slot, point: LatLng, label: string | null): void {
    set((state) => withPoints(state, { [role]: { lat: point.lat, lng: point.lng, label } }));
  },
  viaAdded(point: Point): void {
    set((state) => withPoints(state, { vias: [...state.vias, point] }));
  },
  pointDeleted(role: Slot): void {
    set((state) => withPoints(state, { [role]: null }));
  },
  viaDeleted(i: number): void {
    set((state) => withPoints(state, { vias: state.vias.filter((_, index) => index !== i) }));
  },
  viaMoved(i: number, direction: -1 | 1): void {
    set((state) => {
      const j = i + direction;
      if (j < 0 || j >= state.vias.length) return {};
      const vias = [...state.vias];
      [vias[i], vias[j]] = [vias[j]!, vias[i]!];
      return withPoints(state, { vias });
    });
  },
  notollToggled(notoll: boolean): void {
    set((state) => withPoints(state, { notoll }));
  },
  routesLoaded(pointsKey: string, notoll: boolean, routes: RouteModel[]): void {
    set((state) => ({
      result: resultOf(pointsKey, notoll, routes),
      selected: 0,
      fittedKey: pointsKey,
      // 地点集合が変わった探索だけカメラを動かす（トグル・代替切替では動かさない）
      fitVersion: state.fittedKey === pointsKey ? state.fitVersion : state.fitVersion + 1,
    }));
  },
  routesFailed(pointsKey: string, notoll: boolean): void {
    showToast("経路を探索できません");
    set({ result: resultOf(pointsKey, notoll, []) });
  },
  routeSelected(i: number): void {
    set({ selected: i });
  },
  /** label null の地点を逆ジオ。解決時は座標一致かつ label null の地点だけ更新（配列 identity は不変時維持） */
  labelRequested(point: LatLng): void {
    const key = coordinateLabel(point);
    if (pending.has(key)) return;
    pending.add(key);
    resolveLabel(point).then((label) => {
      pending.delete(key);
      const hit = (candidate: Point) => candidate.label === null && same(candidate, point);
      const apply = (candidate: Point): Point =>
        hit(candidate) ? { ...candidate, label } : candidate;
      set((state) => ({
        from: state.from && apply(state.from),
        to: state.to && apply(state.to),
        vias: state.vias.some(hit) ? state.vias.map(apply) : state.vias,
      }));
    });
  },
  fixUpdated(fix: Fix): void {
    set((state) => ({
      fix,
      gpsError: false,
      fromDefaulted: true,
      // 出発地の既定 = 現在地。URL に from が無ければ初回 fix で 1 回だけ置く（以後追従しない。× で消したら空のまま）
      from: state.fromDefaulted
        ? state.from
        : (state.from ?? { lat: fix.lat, lng: fix.lng, label: null }),
    }));
  },
  gpsFailed(): void {
    if (!getTrip().gpsError) showToast("現在地を取得できません"); // 立ち上がりで 1 回（連続失敗で連打しない）
    set({ gpsError: true });
  },
  popupOpened(point: LatLng): void {
    set({ popup: { kind: "point", point, label: null } });
    resolveLabel(point).then((label) =>
      set((state) =>
        state.popup?.point === point ? { popup: { kind: "point", point, label } } : {},
      ),
    );
  },
  markerPopupOpened(role: PointRole, index: number, point: LatLng): void {
    set({ popup: { kind: "marker", point, role, index } });
  },
  markerDeleteTaken(): void {
    const { popup } = getTrip();
    if (popup?.kind !== "marker") return;
    set({ popup: null });
    if (popup.role === ROLE.VIA) tripActions.viaDeleted(popup.index);
    else tripActions.pointDeleted(popup.role);
  },
  popupClosed(): void {
    set({ popup: null });
  },
  popupActionTaken(role: PointRole): void {
    const { popup } = getTrip();
    if (popup?.kind !== "point") return;
    const point: Point = { lat: popup.point.lat, lng: popup.point.lng, label: popup.label };
    if (role === ROLE.VIA) tripActions.viaAdded(point);
    else tripActions.pointSet(role, point, point.label);
    set({ popup: null });
  },
  /** ポップアップ「自宅にする」。label 未確定（逆ジオ中）なら何もしない */
  popupHomeTaken(): void {
    const { popup } = getTrip();
    if (popup?.kind === "point" && popup.label !== null)
      tripActions.homeChosen(popup.point, popup.label);
  },
  /** 検索欄の候補。home モードは地図を寄せるだけ。自宅の確定は地図タップのポップアップ「自宅にする」 */
  searchPicked(role: PickRole, point: LatLng, label: string | null): void {
    if (role !== ROLE.HOME) tripActions.pointSet(role, point, label);
    else set({ popup: null, panTarget: { lat: point.lat, lng: point.lng } }); // 毎回新しい参照（同じ候補の再タップでも寄せる）
  },
  homeChosen(point: LatLng, label: string): void {
    savedActions.homeSaved({ lat: point.lat, lng: point.lng, label });
    showToast("自宅を登録しました");
    set({ popup: null, mode: MODE.SETTINGS });
  },
  settingsEntered(): void {
    set({ popup: null, sheetExpanded: false, mode: MODE.SETTINGS });
  },
  homeSetupEntered(): void {
    set({ popup: null, mode: MODE.HOME_SETUP });
  },
  /** 「戻る」。home → settings → edit */
  backPressed(): void {
    set((state) => ({
      popup: null,
      mode: state.mode === MODE.HOME_SETUP ? MODE.SETTINGS : MODE.EDIT,
    }));
  },
  setSheet(sheetExpanded: boolean): void {
    set({ sheetExpanded });
  },
  /** ナビ開始（navigation store から）。出発地を現在地に置換し、経路 1 本を入れる。探索フックは通さない */
  navigationStarted(origin: Point, route: RouteModel): void {
    set((state) => {
      const pointsKey = selectPointsKey({ ...state, from: origin });
      return {
        from: origin,
        result: resultOf(pointsKey, state.notoll, [route]),
        selected: 0,
        fittedKey: pointsKey, // ナビ中は fitBounds しない
        popup: null,
        panTarget: null,
        sheetExpanded: false,
        passedVia: 0,
        mode: MODE.NAVIGATION,
      };
    });
  },
  viaPassed(): void {
    set((state) => ({ passedVia: state.passedVia + 1 }));
  },
  /** リルート成功。地点 state は変えない（URL の via は全経由地を維持） */
  rerouted(route: RouteModel): void {
    set((state) => ({
      result: resultOf(selectPointsKey(state), state.notoll, [route]),
      selected: 0,
    }));
  },
  navigationEnded(): void {
    set((state) => ({ mode: MODE.EDIT, fitVersion: state.fitVersion + 1 }));
  },
};
