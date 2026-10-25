# フロント構成

## 方針

- 状態は zustand の store に置く。UI は値をセレクタで購読し、操作はアクションを呼ぶ。外部同期のフック（`use*.ts(x)`）は、使う部品・機能と同じディレクトリに置く。ルーター不使用。状態の一覧は [design/ui.md](../design/ui.md)
- URL クエリ（[map-display.md](map-display.md)）が地点 + notoll の正。編集で `history.replaceState`、読み込み時に復元して探索
- `src/` は機能で分ける（[ADR-0004](../adr/0004-colocation.md)）。1 機能の純関数・store・外部呼び出し・フック・部品を同じディレクトリに置く
- 配置: 使う側が 1 つなら、使う側の隣。複数の機能が使うなら、意味上の持ち主の機能。どの機能にも属さないものは `shared/`。App だけが使うものも同じ規則で置き、`src/` 直下は `main.tsx` `App.tsx` `stylex.css` のみ
- `*.tsx` と `use*.ts` 以外のファイルは `react` `react-dom` を import せず、`*.tsx` `use*.ts` も import しない（zustand・MapLibre・DOM API は使ってよい）
- 機能間の import は自由。`shared/` から機能ディレクトリへの import は禁止
- 調整値（[CONTEXT.md](../CONTEXT.md)）は、使うファイルの先頭に定数で置く
- `src/` 内の import は `@/` からの絶対パス（`@/trip/trip.ts`）。相対パスは書かない
- Vitest は React を import しないファイルの純関数と store のみ。UI・外部呼び出しは手動確認
- ライブラリは React / Vite / TypeScript / MapLibre GL JS / Vitest + StyleX（CSS）+ zustand（状態）+ React Compiler（babel plugin）のみ。追加しない（turf 不採用: 必要な計算は `geo.ts` 数十行）
- CSS: StyleX。`@stylexjs/postcss-plugin` + `@vitejs/plugin-react`（5 系、`babel.configFile: true`）が共通の `babel.config.js` から `@stylexjs/babel-plugin` を読む。色トークンは `src/shared/tokens.stylex.ts`（`defineVars`、ダーク値は `@media (prefers-color-scheme: dark)`）、部品の高さは `src/shared/layout.stylex.ts`（`defineConsts`）
- StyleX は `border` `background` 等のショートハンドを**黙って捨てる**（CSS に出ない → ブラウザ既定の枠が見える）。`borderWidth` / `borderStyle` / `borderColor`、`backgroundColor` の longhand で書く
- 各ファイルの export・シグネチャは [design/modules.md](../design/modules.md)

## 開発ツール

- 型検査: `tsc --noEmit`（`strict`、`noUncheckedIndexedAccess`）
- Lint: oxlint（`react-hooks` プラグイン）。Format: oxfmt。ESLint / Prettier は入れない。`exhaustive-deps` の無効化コメントは書かない（React Compiler がそのコンポーネントをスキップする）
- スマホ実機検証: Geolocation は HTTPS 必須。Mac を tailnet に入れ `tailscale serve --bg 5173` で Vite dev を `https://<mac>.<tailnet>.ts.net` に公開。GraphHopper は Vite の `/gh` proxy 経由で一緒に届く。HMR は追加設定なしで wss になる。`tailscale serve` は Host ヘッダを透過するので `vite.config.ts` に `server.allowedHosts: [".ts.net"]` が必須（ないと "Blocked request"。先頭 `.` はサフィックス一致なのでホスト名を書かなくてよい）

## 空行

oxfmt は空行を足さない。関数本体を意味の段落に分け、段落の間に空行を 1 行、手で入れる。

- 入れる: ガード節（1 行の早期 `return` / `throw` / `continue`）の塊の後。判定する値の宣言とガード節の間には入れない
- 入れる: 宣言の塊と、それを使う処理の間
- 入れる: 複数行の `if` / `for` / `while` / `switch` / コールバック付き呼び出しの前後。ブロックの先頭・末尾には入れない
- 入れる: トップレベル宣言の間。1 行の型・定数宣言が続く塊の中には入れない
- 最後の `return` は、直前が別の処理なら空行で離す。直前が返す値の計算なら離さない
- テスト: 実行 → 検証が 1 回だけなら検証の前に入れる。実行と検証を繰り返すシナリオは、実行と検証の組を 1 段落にして組の間に入れる。組の中には入れない
- 入れない: 3 文以下の関数、`switch` の `case` 間、オブジェクト・配列・引数リストの中、JSX の中、`import` 群の中

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
  App.tsx                   # 下のフックの呼び出しと画面モード別のレイアウトだけ
  stylex.css                # button リセット + @stylex;（StyleX 出力先）
  shared/                   # どの機能にも属さないもの。機能ディレクトリを import しない
    point.ts                # 地点の共通型（LatLng / Fix / Point / PointRole / SavedPoint）、MAX_VIAS
    geo.ts                  # haversine・方位・線分射影
    format.ts               # 距離・時間・時刻の表示文字列
    timeout.ts              # fetch のタイムアウト
    toast.ts                # store。メッセージ 1 つ
    Toast.tsx               # toast.ts の表示。ナビ中かは App から prop で受け取る
    useUpdateCheck.ts       # PWA 更新検知（visible 復帰で index.html 再取得 → reload）
    tokens.stylex.ts        # 色トークン（ライト / ダーク）
    button.stylex.ts        # ボタンの共通スタイル
    layout.stylex.ts        # 部品の高さ（peek / navigationBar / hud / next）
    icons/                  # アイコン。SVG は形だけ持ち、index.tsx が mask + currentColor で着色
      index.tsx             # Icon / FromIcon / ToIcon / HomeIcon / SettingsIcon ほか
      *.svg                 # arrow / uturn / keep / pin / pin-dot / roundabout / home / gear / circle / volume / volume-off（viewBox 24、stroke 2）
      compass.svg           # コンパス（map/maplibre.css が background-image で参照。独自の色を持つ）
  trip/
    trip.ts                 # store。地点・notoll・探索結果・mode・popup・fix
    url.ts                  # クエリ ↔ 地点・notoll
    useUrlSync.ts           # 地点・notoll → history.replaceState
    useGeolocation.ts       # watchPosition（起動時から常時）→ trip.fixUpdated + navigation.onFix
  route/
    graphhopper.ts          # fetch + 例外変換（契約は design/route-model.md）
    route.ts                # RouteModel、GraphHopper 応答 → RouteModel、累積距離、最近傍点
    narrow.ts               # 細い道区間の生成
    useRouteSearch.ts       # 地点・notoll → fetchRoute → store
    RouteSummary.tsx        # 距離 / 時間 / 細い道 / 有料、代替経路の切替
    StepList.tsx
    DirectionIcon.tsx       # GraphHopper sign → 方向アイコン
    __fixtures__/           # GraphHopper 実応答 JSON
  search/
    gsi.ts                  # 住所検索・逆ジオ（search.md）
    yahoo.ts                # 施設名検索（search.md。JSONP）
    useSearch.ts            # 住所・施設名の並行検索（中断、クエリとの照合）
    useReverseGeocode.ts    # label null の地点 → 逆ジオ
    SearchBox.tsx           # 出発地 / 到着地 検索欄 + 設定画面への歯車。自宅設定モードでは自宅欄 1 つ
  navigation/
    navigation.ts           # store。NavigationState・hud。start / onFix / end（design/navigation.md）
    progress.ts             # step(state, fix) → {state, events}（design/navigation.md）
    speech.ts               # speechSynthesis の薄いラッパ（関数）
    useWakeLock.ts
    NavigationHud.tsx       # 次の指示・残り距離・細い道バナー
    NavigationBar.tsx       # 残り時間・到着予想・ミュート・終了・現在地
  map/                      # 全モードに出る地図
    Map.tsx                 # 地図の生成（スタイル切替・コントロール）と下の 4 フックの組み立て
    useRouteLayers.ts       # 経路・代替・現在地の source 更新
    useMarkers.tsx          # 地点マーカー・自宅マーカー
    useMapPopup.tsx         # 地図タップ・マーカーのポップアップ
    useCamera.ts            # モード切替・追従・fitBounds・自宅や候補への移動、ジェスチャ制限・コンパス
    mapLayers.ts            # React 非依存: GeoJSON 生成、source / layer、マーカー DOM
    PointPopup.tsx          # 出発地 / 到着地 / 経由地に追加。自宅設定モードでは「自宅にする」（useMapPopup が portal で描く）
    maplibre.css            # MapLibre 既定 UI の上書き（Map.tsx が maplibre-gl.css の次に読む）
  settings/
    saved.ts                # store。自宅・検索履歴・アイコンのみ表示（localStorage、search.md / map-display.md）
    Settings.tsx            # 設定画面（自宅行・アイコンのみ表示トグル）。settings モードで App が描く
  sheet/                    # 経路編集モードのボトムシート
    BottomSheet.tsx         # 2 段、地点リスト・トグル・代替カード・StepList を内包
    useSheetDrag.ts         # シートのスワイプ開閉
```

## テスト

- `*.test.ts` を実装ファイルの隣に置く
- fixture は `src/route/__fixtures__/`（[route-model.md](../design/route-model.md)）
- 対象: `geo.ts`（距離・方位・射影）、`route.ts`（fixture → RouteModel、累積距離・最近傍点）、`narrow.ts`（結合 → 短区間無視の順、先頭/末尾判定）、`progress.ts`（単調増加・トリガー・リルート連続回数）、`format.ts`（境界値）、`url.ts`（往復変換・不正値無視）、`gsi.ts`（`rankHits` の全文一致優先・安定ソート）、`saved.ts`（`pushHistory` の先頭追加・同座標の除去・5 件上限）、`navigation.ts`（`fetchRoute` を差し替え、開始 → 経路外れ 3 回 → リルート → 到着、リルート打ち切りで旧経路継続、開始の応答待ち中の地点変更で開始中止）
