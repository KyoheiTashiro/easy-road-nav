import { create } from "zustand";
import { fetchRoute } from "@/route/graphhopper.ts";
import { narrowSegments } from "@/route/narrow.ts";
import {
  initNavigation,
  offsetOrigin,
  startText,
  step,
  type NavigationEvent,
  type NavigationState,
  type NextNext,
} from "@/navigation/progress.ts";
import type { Fix, Point } from "@/shared/point.ts";
import type { Instruction, RouteModel } from "@/route/route.ts";
import * as speech from "@/navigation/speech.ts";
import { showToast } from "@/shared/toast.ts";
import {
  MODE,
  getTrip,
  selectNarrow,
  selectProfile,
  selectPointsKey,
  selectRoute,
  tripActions,
} from "@/trip/trip.ts";

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

export const useNavigation = useStore;

export const getNavigation = useStore.getState;
const set = useStore.setState;

let session = 0; // end ごとに進める。リルート応答が同じナビのものか判定する

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
      case "viaPassed":
        tripActions.viaPassed();
        break;
    }
  }
}

// navigation.md「リルート」
async function reroute(state: NavigationState, fix: Fix) {
  const trip = getTrip();
  if (!trip.to) return;

  const requested = session;
  let route: RouteModel | undefined;
  try {
    [route] = await fetchRoute(
      [offsetOrigin(fix, state.heading), ...trip.vias.slice(trip.passedVia), trip.to],
      selectProfile(trip),
      false,
    );
  } catch {}

  if (session !== requested) return; // 応答前に終了・到着（再開していても旧セッションの応答）

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
  tripActions.rerouted(route);
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

    const pointsKey = selectPointsKey(trip);
    speech.unlock(); // iOS: ユーザー操作内で初回 speak
    set({ starting: true });

    const origin: Point = { lat: fix.lat, lng: fix.lng, label: "現在地" };
    let route: RouteModel | undefined;
    try {
      [route] = await fetchRoute([origin, ...trip.vias, trip.to], selectProfile(trip), false);
    } catch {
    } finally {
      set({ starting: false });
    }

    if (!route) {
      showToast("経路を探索できません");
      return;
    }

    // 応答待ちの間にボトムシートで地点・有料トグルを変えられる
    const latest = getTrip();
    if (selectPointsKey(latest) !== pointsKey || latest.notoll !== trip.notoll) {
      showToast("地点が変わったため案内を開始しませんでした");
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
    session++;
    tripActions.navigationEnded();
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
