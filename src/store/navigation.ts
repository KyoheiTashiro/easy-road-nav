import { create } from "zustand";
import { fetchRoute } from "@/api/graphhopper.ts";
import { narrowSegments } from "@/model/narrow.ts";
import {
  initNavigation,
  offsetOrigin,
  startText,
  step,
  type NavigationEvent,
  type NavigationState,
  type NextNext,
} from "@/model/progress.ts";
import type { Fix, Point } from "@/model/point.ts";
import type { Instruction, RouteModel } from "@/model/route.ts";
import * as speech from "@/api/speech.ts";
import { showToast } from "@/store/toast.ts";
import {
  MODE,
  getTrip,
  selectNarrow,
  selectProfile,
  selectRoute,
  tripActions,
} from "@/store/trip.ts";

/** ナビ開始時の zoom（navigation.md「カメラ」） */
export const NAVIGATION_ZOOM = 17;

export type Hud = { instruction: Instruction | null; remaining: number; next: NextNext | null };

export type NavigationStore = {
  navigation: NavigationState | null;
  hud: Hud | null;
  inNarrow: boolean;
  muted: boolean; // セッション内のみ
  starting: boolean; // 「案内開始」の再探索中
};

const useStore = create<NavigationStore>(() => ({
  navigation: null,
  hud: null,
  inNarrow: false,
  muted: false,
  starting: false,
}));

export function useNavigation<T>(selector: (store: NavigationStore) => T): T {
  return useStore(selector);
}
export const getNavigation = useStore.getState;
const set = useStore.setState;

function say(text: string) {
  if (!getNavigation().muted) speech.speak(text);
}

function dispatch(events: NavigationEvent[], state: NavigationState, fix: Fix) {
  for (const event of events) {
    switch (event.type) {
      case "speak":
        say(event.text);
        break;
      case "hud":
        set({
          hud: { instruction: event.instruction, remaining: event.remaining, next: event.next },
        });
        break;
      case "narrow":
        set({ inNarrow: event.segment !== null });
        break;
      case "arrived":
        navigationActions.end(false);
        break;
      case "reroute":
        void reroute(state, fix);
        break;
      case "viaPassed": // passedVia は state 内
        break;
    }
  }
}

// navigation.md「リルート」
async function reroute(state: NavigationState, fix: Fix) {
  const trip = getTrip();
  if (!trip.to) return;
  const passed = trip.passedVia + state.passedVia;
  let route: RouteModel | undefined;
  try {
    [route] = await fetchRoute(
      [offsetOrigin(fix, state.heading), ...trip.vias.slice(passed), trip.to],
      selectProfile(trip),
      false,
      new AbortController().signal,
    );
  } catch {}
  if (getTrip().mode !== MODE.NAVIGATION) return; // 応答前に終了・到着
  if (!route) {
    showToast("経路を再探索できません");
    // 旧経路で継続、次の連続外れで再試行
    set((store) => ({
      navigation: store.navigation && { ...store.navigation, rerouting: false, offRouteCount: 0 },
    }));
    return;
  }
  const current = getNavigation().navigation ?? state;
  const now = getTrip().fix ?? fix;
  const first = step(
    route,
    narrowSegments(route),
    initNavigation(current.zoom, current.follow),
    now,
  );
  set({ navigation: first.state });
  tripActions.rerouted(route, passed);
  speech.cancel();
  say(`経路を再探索しました。${startText(route, first.state.s)}`);
  dispatch(first.events, first.state, now);
}

export const navigationActions = {
  // navigation.md「開始手順」。カメラ・Wake Lock は mode から派生
  async start(): Promise<void> {
    const trip = getTrip();
    const fix = trip.fix;
    if (!fix || !trip.to || getNavigation().starting) return;
    speech.unlock(); // iOS: ユーザー操作内で初回 speak
    set({ starting: true });
    const origin: Point = { lat: fix.lat, lng: fix.lng, label: "現在地" };
    let route: RouteModel | undefined;
    try {
      [route] = await fetchRoute(
        [origin, ...trip.vias, trip.to],
        selectProfile(trip),
        false,
        new AbortController().signal,
      );
    } catch {
    } finally {
      set({ starting: false });
    }
    if (!route) {
      showToast("経路を探索できません");
      return;
    }
    const now = getTrip().fix ?? fix;
    const first = step(route, narrowSegments(route), initNavigation(NAVIGATION_ZOOM), now);
    set({ navigation: first.state });
    tripActions.navigationStarted(origin, route);
    say(`案内を開始します。${startText(route, first.state.s)}`);
    dispatch(first.events, first.state, now);
  },
  onFix(fix: Fix): void {
    const { navigation } = getNavigation();
    const trip = getTrip();
    const route = selectRoute(trip);
    if (trip.mode !== MODE.NAVIGATION || !navigation || !route) return;
    const result = step(route, selectNarrow(trip), navigation, fix);
    set({ navigation: result.state });
    dispatch(result.events, result.state, fix);
  },
  end(cancelSpeech: boolean): void {
    if (cancelSpeech) speech.cancel(); // 到着時は「到着しました」を言い切らせる
    tripActions.navigationEnded(getNavigation().navigation?.passedVia ?? 0);
    set({ navigation: null, hud: null, inNarrow: false });
  },
  setFollow(follow: boolean): void {
    set((store) => ({ navigation: store.navigation && { ...store.navigation, follow } }));
  },
  setZoom(zoom: number): void {
    set((store) => ({ navigation: store.navigation && { ...store.navigation, zoom } }));
  },
  toggleMute(): void {
    const muted = !getNavigation().muted;
    set({ muted });
    if (muted) speech.cancel(); // ON にした時点で再生中・待機中を止める
  },
};
