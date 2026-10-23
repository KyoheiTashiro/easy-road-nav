# フロント構成

## 方針

- 状態は zustand の store（`src/store/`）に置く。UI は値をセレクタで購読し、操作はアクションを呼ぶ。App 全体で 1 つの外部同期（GPS・探索・URL 等）は `src/hooks/` に書く。1 部品だけが使う Effect は、部品と同じディレクトリのフック（`use*.ts(x)`）に出す。ルーター不使用。状態の一覧は [design/ui.md](../design/ui.md)
- URL クエリ（[map-display.md](map-display.md)）が地点 + notoll の正。編集で `history.replaceState`、読み込み時に復元して探索
- 依存方向は `ui/` `hooks/` `App` → `store/` → `api/` → `model/`。`store/` と `model/` は React・DOM 非依存。`api/` は外部システムへの出口（HTTP・JSONP・speechSynthesis）
- `ui/` は画面モードで `map/` `edit/` `navigation/` に分ける。3 つは互いに import しない。共有するもの（stylex トークン・アイコン・Toast）は `ui/` 直下
- `src/` 内の import は `@/` からの絶対パス（`@/store/trip.ts`）。相対パスは書かない
- Vitest は `src/model/` `src/store/` と `src/api/gsi.ts` の純関数のみ。UI・API 呼び出しは手動確認
- ライブラリは React / Vite / TypeScript / MapLibre GL JS / Vitest + StyleX（CSS）+ zustand（状態）+ React Compiler（babel plugin）のみ。追加しない（turf 不採用: 必要な計算は `geo.ts` 数十行）
- CSS: StyleX。`@stylexjs/postcss-plugin` + `@vitejs/plugin-react`（5 系、`babel.configFile: true`）が共通の `babel.config.js` から `@stylexjs/babel-plugin` を読む。色トークンは `src/ui/tokens.stylex.ts`（`defineVars`、ダーク値は `@media (prefers-color-scheme: dark)`）、部品の高さは `src/ui/layout.stylex.ts`（`defineConsts`）
- StyleX は `border` `background` 等のショートハンドを**黙って捨てる**（CSS に出ない → ブラウザ既定の枠が見える）。`borderWidth` / `borderStyle` / `borderColor`、`backgroundColor` の longhand で書く
- 各ファイルの export・シグネチャは [design/modules.md](../design/modules.md)

## 開発ツール

- 型検査: `tsc --noEmit`（`strict`、`noUncheckedIndexedAccess`）
- Lint: oxlint（`react-hooks` プラグイン）。Format: oxfmt。ESLint / Prettier は入れない。`exhaustive-deps` の無効化コメントは書かない（React Compiler がそのコンポーネントをスキップする）
- スマホ実機検証: Geolocation は HTTPS 必須。Mac を tailnet に入れ `tailscale serve --bg 5173` で Vite dev を `https://<mac>.<tailnet>.ts.net` に公開。GraphHopper は Vite の `/gh` proxy 経由で一緒に届く。HMR は追加設定なしで wss になる。`tailscale serve` は Host ヘッダを透過するので `vite.config.ts` に `server.allowedHosts: [".ts.net"]` が必須（ないと "Blocked request"。先頭 `.` はサフィックス一致なのでホスト名を書かなくてよい）

## ディレクトリ

```
compose.yml
graphhopper/
  config.yml
  custom_models/
    car.json
    car_notoll.json
data/                       # gitignore。*.osm.pbf、graph-cache/
scripts/
  deploy-graph.sh
  heap-check.sh           # ヒープ実測（infrastructure.md）
.env.local                  # VITE_YAHOO_APPID（gitignore。ビルド時に埋め込む）
vite.config.ts              # react(babel.configFile)、/gh proxy、allowedHosts、vitest
babel.config.js             # React Compiler + @stylexjs/babel-plugin（vite / postcss 共用）
postcss.config.js           # @stylexjs/postcss-plugin
src/
  main.tsx
  App.tsx                   # hooks の呼び出しと画面モード別のレイアウトだけ
  stylex.css                # button リセット + @stylex;（StyleX 出力先）
  store/                    # zustand。React 非依存、セレクタとアクションだけ export
    trip.ts                 # 地点・notoll・探索結果・mode・popup・fix
    navigation.ts                  # NavigationState・hud。start / onFix / end（design/navigation.md）
    saved.ts                # 自宅・検索履歴・アイコンのみ表示（localStorage、search.md / map-display.md）
    toast.ts                # メッセージ 1 つ
  hooks/                    # App が呼ぶ外部同期
    useRouteSearch.ts       # 地点・notoll → fetchRoute → store
    useReverseGeocode.ts    # label null の地点 → 逆ジオ
    useUrlSync.ts           # 地点・notoll → history.replaceState
    useGeolocation.ts       # watchPosition（起動時から常時）→ trip.fixUpdated + navigation.onFix
    useWakeLock.ts
    useUpdateCheck.ts       # PWA 更新検知（visible 復帰で index.html 再取得 → reload）
  api/                      # 外部システムへの出口
    graphhopper.ts          # fetch + 例外変換（契約は design/route-model.md）
    gsi.ts                  # 住所検索・逆ジオ（search.md）
    yahoo.ts                # 施設名検索（search.md。JSONP）
    speech.ts               # speechSynthesis の薄いラッパ（関数）
  model/
    point.ts                # 地点の共通型（LatLng / Fix / Point / PointRole / SavedPoint）、MAX_VIAS
    geo.ts                  # haversine・方位・線分射影
    tuning.ts               # 調整値（CONTEXT.md の表と同じ順）
    route.ts                # RouteModel、GraphHopper 応答 → RouteModel、累積距離、最近傍点
    narrow.ts               # 細い道区間の生成
    progress.ts             # step(state, fix) → {state, events}（design/navigation.md）
    format.ts               # 距離・時間・時刻の表示文字列
    url.ts                  # クエリ ↔ 地点・notoll
    __fixtures__/           # GraphHopper 実応答 JSON
    *.test.ts               # 実装と同居
  ui/                       # 直下は map/ edit/ navigation/ が共有するものだけ
    tokens.stylex.ts        # 色トークン（ライト / ダーク）
    button.stylex.ts        # ボタンの共通スタイル
    layout.stylex.ts        # 部品の高さ（peek / navigationBar / hud / next）
    icons/                  # アイコン。SVG は形だけ持ち、index.tsx が mask + currentColor で着色
      index.tsx             # FromIcon / ToIcon / HomeIcon / SettingsIcon / DirectionIcon
      *.svg                 # arrow / uturn / keep / pin / pin-dot / roundabout / home / gear / circle / volume / volume-off（viewBox 24、stroke 2）
      compass.svg           # コンパス（maplibre.css が background-image で参照。独自の色を持つ）
    Toast.tsx
    map/                    # 全モードに出る地図
      Map.tsx               # 地図の生成（スタイル切替・コントロール）と下の 4 フックの組み立て
      useRouteLayers.ts     # 経路・代替・現在地の source 更新
      useMarkers.tsx        # 地点マーカー・自宅マーカー
      useMapPopup.tsx       # 地図タップ・マーカーのポップアップ
      useCamera.ts          # モード切替・追従・fitBounds・自宅や候補への移動、ジェスチャ制限・コンパス
      mapLayers.ts          # React 非依存: GeoJSON 生成、source / layer、マーカー DOM
      PointPopup.tsx        # 出発地 / 到着地 / 経由地に追加。自宅設定モードでは「自宅にする」（useMapPopup が portal で描く）
      maplibre.css          # MapLibre 既定 UI の上書き（Map.tsx が maplibre-gl.css の次に読む）
    edit/                   # 経路編集モード
      SearchBox.tsx         # 出発地 / 到着地 検索欄 + 設定画面への歯車。自宅設定モードでは自宅欄 1 つ
      BottomSheet.tsx       # 2 段、地点リスト・トグル・代替カード・StepList を内包
      Settings.tsx          # 設定画面（自宅行・アイコンのみ表示トグル）。settings モードで App が描く
      RouteSummary.tsx      # 距離 / 時間 / 細い道 / 有料、代替経路の切替
      StepList.tsx
    navigation/             # ナビモード
      NavigationHud.tsx     # 次の指示・残り距離・細い道バナー
      NavigationBar.tsx     # 残り時間・到着予想・ミュート・終了・現在地
```

## テスト

- `*.test.ts` を実装ファイルの隣に置く
- fixture は `src/model/__fixtures__/`（[route-model.md](../design/route-model.md)）
- 対象: `geo.ts`（距離・方位・射影）、`route.ts`（fixture → RouteModel、累積距離・最近傍点）、`narrow.ts`（結合 → 短区間無視の順、先頭/末尾判定）、`progress.ts`（単調増加・トリガー・リルート連続回数）、`format.ts`（境界値）、`url.ts`（往復変換・不正値無視）、`api/gsi.ts`（`rankHits` の全文一致優先・安定ソート）、`store/saved.ts`（`pushHistory` の先頭追加・同座標の除去・5 件上限）、`store/navigation.ts`（`fetchRoute` を差し替え、開始 → 経路外れ 3 回 → リルート → 到着、リルート打ち切りで旧経路継続、開始の応答待ち中の地点変更で開始中止）
