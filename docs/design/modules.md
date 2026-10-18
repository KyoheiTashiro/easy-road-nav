# モジュール設計

`src/` 各ファイルの export（型・シグネチャ）。分岐のある箇所だけ擬似コード。
画面・状態は [ui.md](ui.md)、ナビの処理順は [nav.md](nav.md)、経路構造は [route-model.md](route-model.md)。ディレクトリは [frontend.md](../requirements/frontend.md)。

依存方向: `ui/` `nav/` `App` → `api/` → `model/`。`model/` は React・DOM・fetch 非依存。

## 共通型（`src/model/route.ts` に置く）

```ts
export type LatLng = { lat: number; lng: number };
export type Fix = LatLng & { accuracy: number; t: number }; // t = position.timestamp
export type Point = LatLng & { label: string | null }; // label null = 逆ジオ中
export type PointRole = "from" | "to" | { via: number }; // マーカー削除・地点リスト操作の対象
```

## `src/url.ts`

```ts
export type Query = { from: LatLng | null; to: LatLng | null; vias: LatLng[]; notoll: boolean };
export function parseQuery(search: string): Query; // location.search
export function buildQuery(q: Query): string; // "?from=..&to=..&via=..|..&notoll=1"。地点なし・notoll false は省略。全部なしなら ""
```

parse:

```
parseLatLng(s) =
  s を "," で分割、2 要素でなければ null。空要素があれば null（Number("") は 0 になるため）
  lat, lng = Number()。Number.isFinite でなければ null
  lat ∉ [-90, 90] または lng ∉ [-180, 180] なら null
from  = parseLatLng(params.get("from"))
to    = parseLatLng(params.get("to"))
vias  = (params.get("via") ?? "").split("|").filter(Boolean).map(parseLatLng).filter(非 null).slice(0, 5)
notoll = params.get("notoll") === "1"
```

不正な地点はその地点だけ無視（全クエリ破棄しない）。build は `toFixed(5)`。

## `src/api/graphhopper.ts`

```ts
export type Profile = "car" | "car_notoll";
export class RouteError extends Error {} // 400 の message（"Cannot find point" 等）。ネットワーク不達は fetch の TypeError のまま

export function fetchRoute(
  points: LatLng[], // 出発地 → 経由地 → 到着地
  profile: Profile,
  alternatives: boolean, // vias.length === 0 のとき true → alternative_route.max_paths 3
  signal: AbortSignal,
): Promise<RouteModel[]>; // paths[] を fromGhPath で変換。[0] が本線
```

リクエスト body は [route-model.md](route-model.md) の契約。`AbortError` は呼び出し側で握りつぶす（トーストしない）。

## `src/api/gsi.ts`

```ts
export type SearchHit = { title: string; lat: number; lng: number };
export function rankHits(q: string, hits: SearchHit[]): SearchHit[]; // q を title に含む候補を先頭へ（安定）
export function searchAddress(q: string, signal: AbortSignal): Promise<SearchHit[]>; // rankHits 後の先頭 10 件
export function reverseGeocode(p: LatLng, signal?: AbortSignal): Promise<string | null>; // results.lv01Nm。応答 {} → null
```

失敗は throw。呼び出し側がトースト（検索）または座標表示にフォールバック（逆ジオ）。

## `src/api/nominatim.ts`

```ts
export function searchPoi(q: string, signal: AbortSignal): Promise<SearchHit[]>; // Nominatim 公式。name（無ければ display_name）を title に
```

`format=jsonv2&countrycodes=jp&accept-language=ja&limit=10`。モジュール変数で前回送信時刻を持ち、1 秒未満なら待ってから送る（規約 1 req/秒）。待ち中に abort されたら `throwIfAborted` で抜ける。失敗は throw。

## `src/model/geo.ts`

```ts
export function haversine(a: LatLng, b: LatLng): number; // m
export function bearing(a: LatLng, b: LatLng): number; // deg、北 0、時計回り、[0, 360)
export function destination(p: LatLng, bearingDeg: number, dist: number): LatLng; // リルート前方オフセット用
export function projectToSegment(p: LatLng, a: LatLng, b: LatLng): { t: number; dist: number };
// 局所平面近似（x = Δlng·cos(lat_a)、y = Δlat、m 換算）。t は線分上パラメータを [0, 1] にクランプ、dist は p から射影点までの m
```

## `src/model/route.ts`

```ts
export type RouteModel = { ... };            // route-model.md の定義そのまま
export type Instruction = RouteModel["instructions"][number];
export type GhPath = { ... };                 // GraphHopper paths[] 要素の必要フィールドだけ型定義

export function fromGhPath(path: GhPath): RouteModel;
  // cum: haversine 累積。roadClass: 文字列 → kind（CONTEXT.md の表。BUSWAY・OTHER は narrow、TRACK は forbidden）
  // viaIndices: sign == 5 の from
export function nearest(route: RouteModel, p: LatLng): { s: number; distanceToRoute: number; segmentIndex: number };
  // 全線分に projectToSegment、dist 最小を採用。s = cum[i] + t × (cum[i+1] − cum[i])
export function segmentBearing(route: RouteModel, i: number): number;  // bearing(P[i], P[i+1])
export function tollDistance(route: RouteModel): number;               // toll.value == "all" の合計 m
```

変換を `model/` に置くのは fixture JSON でテストするため。`api/graphhopper.ts` は fetch と例外変換だけ。

## `src/model/narrow.ts`

```ts
export type NarrowSegment = {
  from: number;
  to: number; // 頂点 index 範囲
  length: number; // m
  atStart: boolean; // from === 0（出発地に接する → 警告しない）
  atEnd: boolean; // to === n − 1（到着地に接する → 「目的地付近」）
};
export function narrowSegments(
  route: RouteModel,
  ignoreBelow = 30,
  mergeBelow = 50,
): NarrowSegment[];
export function entersNarrow(instr: Instruction, segs: NarrowSegment[]): boolean;
// segs.some(s => instr.from <= s.from && s.from < instr.to)。StepList の「⚠ 細い道」
```

生成（適用順は CONTEXT.md「細い道区間」）:

```
raw = route.roadClass.filter(r => r.kind !== "wide")        // narrow + forbidden
// 1. 隣接連結: 前の to == 次の from なら 1 つに
// 2. 区間結合: 前の to と次の from の間の広い道 cum[next.from] − cum[prev.to] < mergeBelow なら結合
merged = []
for seg in raw:
  last = merged 末尾
  if last && cum[seg.from] − cum[last.to] < mergeBelow: last.to = seg.to
  else merged.push({ from: seg.from, to: seg.to })
// 3. 短区間無視
return merged
  .map(s => ({ ...s, length: cum[s.to] − cum[s.from], atStart: s.from === 0, atEnd: s.to === n − 1 }))
  .filter(s => s.length >= ignoreBelow)
```

隣接連結は 2 の特殊ケース（間隔 0）なので 1 ループで済む。描画は `roadClass` を直接使い、この関数を通さない。

## `src/model/progress.ts`

```ts
export type NavState = { ... };   // nav.md
export type NavEvent = ...;       // nav.md

export function initNav(zoom: number, follow?: boolean): NavState;
  // s 0、segmentIndex 0、heading null、lastFix null、announced 空、passedVia 0、offRouteCount 0、rerouting false
export function step(route: RouteModel, narrow: NarrowSegment[], state: NavState, fix: Fix): { state: NavState; events: NavEvent[] };
export function remainingTime(route: RouteModel, s: number): number;   // ms。nav.md「下部バー」の式
export function startText(route: RouteModel, s: number): string;      // 「この先 1.2 キロ、右方向です」。開始時・リルート後に使う
export function offsetOrigin(fix: Fix, heading: number | null): LatLng;
  // heading null → fix そのまま、それ以外 destination(fix, heading, リルート前方オフセット)
```

`step` の処理順は nav.md。そこに書いていない境界:

```
- state は毎回新オブジェクトを返す。announced は同じ Set を使い回して add（React の比較対象にしないため問題なし）
- 精度フィルタで弾いた fix は lastFix にも入れない
- 経路外れ中の heading: lastFix があり haversine(lastFix, fix) >= 方位算出最小移動 なら bearing(lastFix, fix) で更新し lastFix = fix。
  未満なら heading・lastFix とも据え置き。lastFix が null なら lastFix = fix のみ
- 経路内に戻った fix: offRouteCount = 0、lastFix = fix、heading = segmentBearing
- 進捗据え置き（nearest.s < state.s）のときも heading は state.segmentIndex の方位、hud は出す
- 経由地通過は while（1 fix で複数経由地を越えたら全部 viaPassed。発話は 1 回）
- 次の案内地点が見つからない（到着直前で sign != 0 の指示が残っていない）→ hud { instruction: null, remaining: cum[n−1] − s }
- 案内予告の「直前の案内地点との間隔」= cum[この指示.from] − cum[直前の sign != 0 指示.from]。先頭の案内地点は出発地からの距離
- narrow event は毎 fix（null 含む）。hud と同じく App が state に載せる
- rerouting 中（true）でも精度・最近傍・経路外れ判定は続ける。再発火はしない
```

## `src/model/format.ts`

```ts
export function formatDuration(ms: number): string; // "1 時間 20 分" / "25 分" / 1 分未満 "1 分"。サマリ・下部バー共通
export function formatKm(m: number): string; // "12.3 km"（0.1 km 単位）。サマリ・代替カード
export function formatDistance(m: number): string; // HUD: ≥ 1000 → "1.2 km"、未満 "340 m"（10 m 単位）
export function formatSpokenDistance(m: number): string; // "1.2 キロ" / "300 メートル"（1 km 以上 0.1 km、未満 100 m 単位）
export function formatClock(d: Date): string; // "HH:MM"
```

## `src/nav/useGeolocation.ts`

```ts
export function useGeolocation(onError: () => void): { fix: Fix | null; error: boolean };
```

- マウントで `watchPosition`（`enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 10000`）。アンマウントで `clearWatch`。アプリ起動中は常時
- 成功: `fix` 更新、`error = false`。失敗（`PERMISSION_DENIED` / `POSITION_UNAVAILABLE` / `TIMEOUT`）: `error = true`。`fix` は前回値を保持。Geolocation 非対応は初期値 `error = true`
- `onError` は `error` の立ち上がりで 1 回だけ呼ぶ（連続失敗で連打しない）。App はトースト「現在地を取得できません」を渡す。最新の callback は ref で保持し、effect は再登録しない

## `src/nav/useSpeech.ts`

```ts
export function useSpeech(muted: boolean): {
  speak(text: string): void;
  cancel(): void;
  unlock(): void;
};
```

- キュー: `speechSynthesis` 内蔵のキューをそのまま使う（`speak` は順に再生される）。自前キューは持たない
- `muted` なら `speak` を捨てる（キューにも積まない）。ミュート ON で再生中・待機中は `cancel`
- 直前の文字列がまだ再生・待機中（`onend` / `onerror` 前）で同一なら捨てる。再生し終えた後の同一文字列は再発話する
- `lang = "ja-JP"`、`rate = 1`。voice は指定しない（既定）
- `cancel`: `speechSynthesis.cancel()`。「終了」・リルート成功時に呼ぶ（到着時は呼ばない。「目的地に到着しました」を言い切る）
- `unlock`: 空文字の発話。iOS Safari はユーザー操作内の `speak` が必要なため「案内開始」の click ハンドラ先頭で呼ぶ（再探索の await 後では操作文脈が切れる）
- `speechSynthesis` 非対応環境では全て no-op

## `src/nav/useWakeLock.ts`

```ts
export function useWakeLock(active: boolean): void;
```

- `active` 中 `navigator.wakeLock?.request("screen")`。非対応なら何もしない
- `visibilitychange` で `visible` に戻ったら再取得。`active` が false になったら・アンマウントで `release`

## `src/useUpdateCheck.ts`

```ts
export function useUpdateCheck(blocked: boolean): void;
```

- standalone PWA は再表示時にページを再読込しない（`tailscale serve` はヘッダ制御不可で `index.html` の heuristic cache も効く）ため自前で更新検知する
- `visibilitychange` で `visible` に戻ったら `fetch("/", { cache: "no-store" })`。現在の `<script type="module">` の `src`（hash 付き bundle）が応答に含まれなければ古い → `location.reload()`
- `blocked`（ナビ中）なら reload を保留し、false になった時点で実行。fetch 失敗は無視（次回 visible で再試行）
- `import.meta.env.DEV` では何もしない

## `src/ui/Map.tsx`

```ts
type MapProps = {
  mode: "edit" | "nav";
  from: Point | null;
  to: Point | null;
  vias: Point[];
  fix: Fix | null;
  routes: RouteModel[];
  selected: number;
  fitVersion: number; // 増えたら選択経路に fitBounds（下パディング = シートのピーク高）
  nav: NavState | null; // follow / heading / zoom を読む
  popup: { p: LatLng; label: string | null } | null;
  canAddVia: boolean;
  onTap(p: LatLng): void; // 編集モードの click。ナビ中は無視
  onPopupAction(role: "from" | "to" | "via"): void;
  onPopupClose(): void;
  onMarkerDelete(role: "from" | "to" | { via: number }): void;
  onDragStart(): void; // ナビ中 → follow false
  onZoomEnd(zoom: number): void; // ナビ中のピンチ → state.zoom
};
export const NAV_ZOOM = 17; // ナビ開始時の zoom（App の initNav に渡す）
export const NAV_PITCH = 50; // ナビ中の pitch（ナビ開始の jumpTo）
export function Map(props: MapProps): JSX.Element;
```

内部:

- スタイル: `matchMedia("(prefers-color-scheme: dark)")` で `liberty` / `dark` の URL を選ぶ。`change` で `map.setStyle(url)`
- `style.load` のたびに `applyStyleExtras(map)`: ①ラベル上書き（下記）②経路 source `route` `alt` + layer 3 つ（ui.md「経路レイヤー」）③現在地 source `fix` + circle layer 2 つ（精度円・青ドット）。初期化とダーク切替で同じ関数
- ラベル上書き: `map.getStyle().layers` のうち `layout["text-field"]` を持ち、その式に `"ref"` を含まないもの全部に `setLayoutProperty(id, "text-field", ["coalesce", ["get", "name:ja"], ["get", "name"]])`
- 精度円: feature に `r0 = accuracy / (156543.03 × cos(lat))`（zoom 0 での px 半径）を持たせ、`circle-radius: ["interpolate", ["exponential", 2], ["zoom"], 0, ["get", "r0"], 22, ["*", ["get", "r0"], 4194304]]`
- 地点マーカー: DOM `Marker` を `useEffect([from, to, vias])` で作り直す。タップで「削除」ポップアップ
- ポップアップ: MapLibre `Popup` 1 個（`closeOnClick: false`）。`setDOMContent(div)` して `createPortal(…, div)`。内容は `popup` prop（PointPopup）優先、無ければ内部 state のマーカー「削除」ボタン。両方 null で `remove`。開いている間は `setLngLat` のみ（`addTo` し直すと `close` が発火して閉じる）。`close` イベント（×）→ `onPopupClose`。マーカー click は `stopPropagation`（地図 `click` に伝播させない）
- 現在地: `useEffect([fix])` で `fix` source を更新。初回 fix で `from` `to` とも null なら `easeTo(zoom 15)`（1 回だけ）
- カメラ: `useEffect([fitVersion])` で `fitBounds`。ナビ中は `useEffect([fix, nav.heading])` で `easeTo`（nav.md「カメラ」）。ナビ開始・終了で `jumpTo`（`pitch: NAV_PITCH` / 0、padding）/ ジェスチャ制限の切替
- イベント: `click`（編集モードのみ `onTap`）、`dragstart`、`zoomend`（`originalEvent` あり）

## `src/ui/SearchBox.tsx`

```ts
type SearchBoxProps = {
  from: Point | null;
  to: Point | null;
  fix: Fix | null; // 出発地候補「現在地」の表示条件（App は GPS エラー中 null を渡す）
  onSet(role: "from" | "to", p: LatLng, label: string | null): void; // label null = 逆ジオへ
  onClear(role: "from" | "to"): void; // × ボタン。App の onDelete
  onError(msg: string): void; // トースト
};
```

内部 state: `active`（フォーカス中の欄）、`query`、`poiQ`（Enter 確定したクエリ）、`result = { q, hits, source: "gsi" | "osm" }`。欄の表示値は `active === role ? query : point.label ?? "…"`。表示する候補は `active` あり かつ `result.q === query.trim()` のときだけ（古い結果・2 文字未満で空）。候補リスト末尾の出典行は `source` で切替（国土地理院 / © OpenStreetMap contributors）。

検索の effect は `[q, poiQ]` 依存 1 つ:

```
if (poiQ === q)   → searchPoi(q)（即時）。0 件ならトースト「施設が見つかりません」
else if (q.length >= 2) → 300 ms debounce → searchAddress(q)
cleanup → AbortController で中断
```

Enter で `poiQ = q`。入力が変わると `poiQ !== q` になり住所検索へ戻る（施設検索中なら cleanup で中断）。フォーカス時に `poiQ` を null に戻す（同じ文字列を再入力しただけで施設検索が走らないように）。候補選択で `query` クリア・`active` null・`onSet`。blur は 150 ms 遅延で `active` を外す（候補タップより blur が先に来る）。

## `src/ui/PointPopup.tsx`

```ts
type PointPopupProps = {
  label: string | null;
  canAddVia: boolean;
  onAction(role: "from" | "to" | "via"): void;
};
```

## `src/ui/BottomSheet.tsx`

```ts
type BottomSheetProps = {
  expanded: boolean;
  onExpand(v: boolean): void; // 上スワイプ true / 下スワイプ false
  from: Point | null;
  to: Point | null;
  vias: Point[];
  passedVia: number; // 通過済 表示用
  onDelete(role: "from" | "to" | { via: number }): void;
  onMoveVia(index: number, dir: -1 | 1): void;
  notoll: boolean;
  onNotoll(v: boolean): void;
  routes: RouteModel[];
  narrows: NarrowSegment[][];
  selected: number;
  onSelect(i: number): void;
  loading: boolean;
  canStart: boolean;
  onStart(): void;
};
```

内部に地点リスト（別ファイルにしない）。ピーク = `RouteSummary` + 「案内開始」。展開 = 地点リスト → トグル → 代替カード → `StepList`。

## `src/ui/RouteSummary.tsx`

```ts
type RouteSummaryProps = {
  routes: RouteModel[];
  selected: number;
  onSelect(i: number): void;
  loading: boolean;
  compact: boolean;
};
```

`compact` = ピーク行（選択経路 1 行）。展開時は代替カード（最大 3 枚）。表示は `format.ts`。

## `src/ui/StepList.tsx`

```ts
type StepListProps = { route: RouteModel; narrow: NarrowSegment[] };
```

`instructions` を全部表示（`sign 0` 含む）。各行: `DirectionIcon` / `formatDistance(distance)` / `text` / `streetName`。`entersNarrow` が真なら先頭に「⚠ 細い道」。

## `src/ui/NavHud.tsx`

```ts
type NavHudProps = {
  instruction: Instruction | null;
  remaining: number;
  inNarrow: boolean;
  rerouting: boolean;
};
```

`instruction` null → 「目的地まで」+ 残り距離。

## `src/ui/NavBar.tsx`

```ts
type NavBarProps = {
  remainingMs: number;
  arrivalAt: number; // 到着予想 epoch ms。App が fix.t + remainingMs で計算（render 内で Date.now を呼ばない）
  muted: boolean;
  onMute(): void;
  onEnd(): void;
  follow: boolean;
  onFollow(): void;
};
export const NAVBAR_HEIGHT = 64; // Map のナビ時 padding.bottom
```

到着予想 = `formatClock(new Date(arrivalAt))`。

## `src/ui/icons.tsx`

```ts
export function DirectionIcon(props: { sign: number; exitNumber?: number }): JSX.Element;
```

sign → 11 種（nav.md）。`4` `5` はピン。未知の sign は直進アイコン。

## `src/ui/Toast.tsx`

```ts
type ToastProps = { message: string | null; navMode: boolean }; // navMode で位置を HUD 下へ
```

消去タイマーは App（`useEffect([toast])` で 4 秒後に null）。

## `src/ui/tokens.stylex.ts`

`defineVars` で色トークン。ライト値 + `@media (prefers-color-scheme: dark)` のダーク値。経路線の色（青・オレンジ）は MapLibre 側なのでここに置かない。

## `src/App.tsx`

state は ui.md。追加で:

```ts
const [fitVersion, setFitVersion] = useState(0);
const [sheetExpanded, setSheetExpanded] = useState(false);
const [popup, setPopup] = useState<{ p: LatLng; label: string | null } | null>(null);
const [hud, setHud] = useState<{ instruction: Instruction | null; remaining: number } | null>(null);
const [inNarrow, setInNarrow] = useState(false);
const [passedVia, setPassedVia] = useState(0); // 現在の経路より前に通過した経由地数。リルートで加算、終了時に nav.passedVia を畳む、地点変更・開始で 0
```

主要な流れ:

- 起動: `parseQuery(location.search)` → 地点 state（label null）→ 各地点を `reverseGeocode`（失敗は座標文字列）。`useGeolocation` は即 watch。初回 fix で `map.easeTo(zoom 15)`（`from` `to` とも null のときだけ。URL に地点があれば `fitVersion` が優先）
- 探索: `useEffect([pointsKey, reqKey])`（ui.md「状態」）。前回と `pointsKey` が違えば応答後に `fitVersion++`。`routes` `loading` は `result` からの派生値
- 逆ジオ: `useEffect([from, to, vias])` で `label === null` の地点を `reverseGeocode`（失敗・`{}` は座標文字列）。座標キーで in-flight を重複排除し、解決時は座標一致かつ `label === null` の地点だけ更新（配列 identity は不変時維持）
- `useEffect([fix])`（ナビ中）: `step` → events を分配。`speak` → `useSpeech`、`hud` / `narrow` → state、`viaPassed` → `nav.passedVia` は state 内、`arrived` → 終了処理、`reroute` → `fetchRoute([offsetOrigin(fix, heading), ...vias.slice(passedVia + nav.passedVia), to], profile, false)`
- ナビ開始（nav.md「開始手順」）: 再探索後 `setNav(initNav(NAV_ZOOM))` し、最新 fix で `step` を 1 回即時実行して HUD を出す
- リルート成功: `result` を `{ key: 現在の reqKey, routes: [r] }` で置換（地点 state は変えない）、`setSelected(0)`、`passedVia += nav.passedVia`、`initNav(nav.zoom, nav.follow)` で最新 fix を `step` 1 回、`cancel()` → 発話「経路を再探索しました」+ `startText`
- リルート失敗: トースト「経路を再探索できません」、`nav.rerouting = false`・`offRouteCount = 0`、旧経路のまま。応答前に終了していたら何もしない
- ナビ開始の再探索は探索 effect を通さず `fetchRoute` を直接呼ぶ（代替なし）。結果を `result` に `key = 新地点の pointsKey + notoll` で入れ、`fittedKey` も更新して探索 effect の再 fetch と `fitVersion++` を抑止。探索 effect はナビ中 return
- 終了・到着: `setMode("edit")`、`setNav(null)`、`fitVersion++`。「終了」のみ `cancel()`（到着は発話を言い切る）。GPS watch とマーカーはそのまま
- URL: `useEffect([from, to, vias, notoll])` で `history.replaceState(null, "", buildQuery(...) || location.pathname)`

## `src/main.tsx`

`createRoot` + `StrictMode` + `<App />`。`import "./stylex.css"`（StyleX の出力先）。

## 設定ファイル

- `babel.config.js`: `@stylexjs/babel-plugin`（`runtimeInjection: false`、`unstable_moduleResolution`）+ `parserOpts.plugins: ["typescript", "jsx"]`。`@vitejs/plugin-react` と `@stylexjs/postcss-plugin` の両方がこれを読む（StyleX 設定の単一ソース）
- `vite.config.ts`: `@vitejs/plugin-react` **5 系**（`react({ babel: { configFile: true } })`。6 系は `babel` オプション廃止のため使わない）、`server.proxy["/gh"]`（`rewrite` で prefix 除去）、`server.allowedHosts: [".ts.net"]`（実機検証、frontend.md）、`test.passWithNoTests`（`vitest/config` の `defineConfig`）
- `postcss.config.js`: `@stylexjs/postcss-plugin`（`include: ["src/**/*.{ts,tsx}"]`）。`src/stylex.css` に `@stylex;`
- `tsconfig.json`: 単一ファイル（project references なし）。`strict: true`、`noUncheckedIndexedAccess: true`、`include: ["src", "vite.config.ts"]`
- `.oxlintrc.json`: `react` プラグインの `rules-of-hooks`（error）`exhaustive-deps`（warn）。`.oxfmtrc.json`: `printWidth: 100`
- `package.json` scripts: `dev` `build` `preview` `test`（vitest）`typecheck`（`tsc --noEmit`）`lint`（oxlint）`fmt`（oxfmt）`deploy` `deploy:graph`
