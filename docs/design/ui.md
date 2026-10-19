# UI 設計（編集モード・共通部品）

要件は [map-display.md](../requirements/map-display.md) [search.md](../requirements/search.md) [routing.md](../requirements/routing.md)。ここでは画面・操作・状態の「どう作るか」。ナビ中の画面は [nav.md](nav.md)。

## 画面モード

`edit`（経路編集）・`nav`（案内中）・`home`（自宅設定）の 3 つ。`App.tsx` の `mode` state で切替。

- `edit` → `nav`: 「案内開始」（[nav.md](nav.md) の開始手順）
- `nav` → `edit`: 「終了」（確認なし）または到着。経路・地点はそのまま残り、再度「案内開始」できる。GPS watch は継続
- `edit` → `home`: ボトムシートの「自宅を設定」/「変更」。経路・地点はそのまま残る
- `home` → `edit`: 自宅を選んで保存したとき、または「戻る」（[自宅設定モード](#自宅設定モード)）

## 初期表示

- 起動と同時に `watchPosition` 開始（[現在地](#現在地)）。URL に地点がなければ初回 fix で `easeTo`（zoom 15）。URL に地点があれば探索結果の `fitBounds` が優先
- 初回 fix 前・権限拒否時の中心は東京駅 zoom 10

## 地図スタイル

- OpenFreeMap `liberty`。`prefers-color-scheme: dark` なら `dark`。`matchMedia` の `change` で `map.setStyle` し実行中も追従
- `setStyle` は自前の source / layer とラベル上書きを消す → `style.load` のたびに同じ初期化関数を呼ぶ（経路レイヤー・現在地レイヤー・ラベル上書き）
- ラベル上書き: `text-field` を持つレイヤーのうち `ref` シールド以外を `["coalesce", ["get", "name:ja"], ["get", "name"]]` に置換（付属スタイルは「ローマ字 + 日本語」併記）
- UI 側のダークは StyleX トークンの `@media` で自動。経路線の色（青 / オレンジ）は両テーマ共通

## 編集モードのレイアウト

地図フルスクリーン。オーバーレイは 3 つ。

- 上部: 検索欄 2 段（出発地 / 到着地）
- 下部: ボトムシート
- 右下: MapLibre 帰属表示（compact）

### ボトムシート

2 段。上スワイプで展開、下スワイプで収納（touchstart/touchend の縦移動 30px 以上。展開中にリストがスクロール済みなら下スワイプは無視）。タップ切替なし。CSS `max-height` transition のみ、ライブラリ不使用。

- **ピーク**: サマリ 1 行（距離 / 時間 / 細い道 x.x km（n 区間）/ 有料 x.x km）+ 「案内開始」ボタン
- **展開**: 上から順に
  1. 地点リスト（出発地 / 経由地 1..n / 到着地）。各行: 役割ラベル・地点名・削除ボタン。経由地行は ▲▼ 並べ替えボタン付き
  2. 「高速・有料を避ける」トグル
  3. 自宅行。登録済みなら「自宅」+ 地点名 + 「変更」ボタン、未登録なら「自宅を設定」ボタン。どちらも `home` モードへ
  4. 代替経路カード（最大 3 枚。距離 / 時間 / 細い道 x.x km（n 区間）。選択中はハイライト。タップで本線入替）
  5. 案内文リスト（`StepList`。GraphHopper の返却全部（`sign 0` 含む）。ステップごとに 距離 / 指示 / 道路名。細い道区間に入るステップの先頭に「⚠ 細い道」）

表示文字列（距離・時間・時刻）は `src/model/format.ts` に集約（[modules.md](modules.md)）。所要時間は「1 時間 20 分」「25 分」「1 分」。

「案内開始」の有効条件: 経路あり かつ GPS fix あり。

### 検索欄

出発地・到着地の入力 2 段。各欄は「現在の地点名の表示」と「住所検索・施設名検索」を兼ねる。経由地はここでは扱わない（地図タップ → ポップアップ）。

- 未フォーカス: 地点名を表示（逆ジオ中は「…」、未設定なら placeholder「出発地を検索」）。右端の × で地点を削除（`onDelete` と同じ。削除後は空のまま）
- フォーカス: 空欄から検索開始。Enter（`<form onSubmit>`。入力欄は `enterKeyHint="search"` でスマホキーボードに「検索」キー）で国土地理院 住所検索と Yahoo! ローカルサーチ 施設名検索を 1 回ずつ並行して呼ぶ（[search.md](../requirements/search.md)）。入力中は呼ばない。IME 変換確定の Enter は `keydown` で `isComposing || keyCode === 229` を見て submit させない。再 Enter で前回の飛行中リクエストを `AbortController` で中断。検索 state はフォーカス中の欄 1 つ分だけ持つ
- 住所検索の結果は素の GeoJSON Feature 配列（FeatureCollection ではない）。`geometry.coordinates` = `[lng, lat]`、`properties.title` = 表示名。件数上限なし。全件リスト表示（リストは `maxHeight: 40vh` でスクロール）
- 1 つのリストに施設候補（最大 100）→ 住所候補（全件）の順で並べる。見出しは付けない。返った方から順に表示し、片方が 0 件・失敗でももう片方は出す。Enter 後に入力を変えると結果は消え、再 Enter まで出ない
- 候補タップ → その欄の役割（出発地 / 到着地）に直接セット。ポップアップ・`flyTo` はしない（探索後の `fitBounds` に任せる）。欄のフォーカスを外す
- 出発地欄の候補リスト先頭に「現在地」行（fix あり・GPS エラーなしのとき）。選択で最新 fix を出発地に置換（地点名は逆ジオ）
- 入力が空のとき（`query.trim() === ""`）は「現在地」の下に「自宅」行（登録済みのとき。「自宅」+ 地点名）と検索履歴行（地点名のみ。新しい順、最大 5）を出す。到着地欄は「自宅」→ 履歴。1 文字でも入力すると消える
- 住所検索・施設名検索の候補タップは、その地点を検索履歴の先頭に入れる（`saved.ts` の `pushHistory`）。「現在地」「自宅」「履歴」行のタップは入れない
- 失敗（ネットワーク・非 2xx）→ トースト「住所検索に失敗しました」/「施設検索に失敗しました」。もう片方の候補は出る。地図タップで代替
- blur で候補リストを閉じる。候補タップより blur が先に来るので 150 ms 遅らせる

### 地点ポップアップ

地図タップで開く MapLibre `Popup`。1 つだけ（開いたまま別地点タップで置換）。

- 内容: 地点名（逆ジオ結果。取得中は「…」）+ ボタン 3 つ「出発地にする」「到着地にする」「経由地に追加」
- 逆ジオ: 国土地理院 `LonLatToAddress`。表示は `results.lv01Nm`（町丁目）のみ。市区町村名は出さない（`muniCd` → 名前の変換表 `muni.js` が別途必要なため v1 は不採用）
- 逆ジオ失敗・海上（応答 `{}`）→ 地点名は座標 `35.68123, 139.76712`（小数 5 桁）。探索は止めない
- 「出発地にする」「到着地にする」は既存地点を無確認で置換
- 「経由地に追加」は末尾に追加。経由地 5 件のとき無効表示
- ボタン押下でポップアップを閉じる。別地点タップは置換（閉じない）。閉じるだけなら × ボタン
- `home` モードではボタンは「自宅にする」1 つ。地点名が逆ジオ中（null）の間は無効。押下で自宅を保存し `edit` へ戻る

### 地点マーカー

MapLibre DOM `Marker`。出発地（緑）・到着地（赤）・経由地（青、番号付き）。ドラッグ不可。
マーカータップ → 「削除」ボタンだけのポップアップ。削除で再探索。
自宅マーカー（家アイコン）は登録済みなら全モードで常時表示。タップしても何も起きない。

### 現在地

- 起動時に `watchPosition` 開始（`enableHighAccuracy: true`）。アンマウントまで常時継続。ナビ終了でも止めない
- 現在地マーカー: 青ドット + 精度円（GeoJSON `circle` layer、半径は `accuracy` をズームでメートル換算。式は [modules.md](modules.md)）。編集・ナビとも常時表示
- 出発地の既定 = 現在地。URL に `from` がなければ初回 fix で 1 回だけ出発地にセット（地点名は逆ジオ）。以後 fix に追従しない（追従すると毎 fix 再探索。ナビ開始時に最新 fix で置換される: [nav.md](nav.md)）。× で消したら再セットしない
- 出発地欄の候補「現在地」: 最新 fix を出発地に置換（地点名は逆ジオ）。fix なし・GPS エラー中は非表示
- 権限拒否・取得失敗 → トースト「現在地を取得できません」（`error` の立ち上がりで 1 回）。「現在地」候補を隠し「案内開始」を無効化。ナビ中の失敗はトーストのみ、ナビ継続

## 自宅設定モード

`mode === "home"`。地図フルスクリーンに上部の検索カード 1 枚だけを重ねる。ボトムシートは出さない。経路レイヤー・地点マーカーは編集中のまま残す（state を変えない。消す手間を省く割り切り）。

- 上部カード: 「戻る」ボタン + 入力欄 1 つ（placeholder「自宅を検索」）。入力欄の動きは編集モードの検索欄と同じ（住所検索・施設名検索を並行）。空欄候補は「現在地」→ 検索履歴。「自宅」行は出さない
- 候補タップ（住所・施設名・履歴）→ 自宅を保存、トースト「自宅を登録しました」、`edit` へ戻る。住所・施設名の候補は検索履歴にも入れる
- 「現在地」タップ → 最新 fix にポップアップを開く（地点名は逆ジオ）。確定はポップアップの「自宅にする」
- 地図タップ → ポップアップ「自宅にする」（[地点ポップアップ](#地点ポップアップ)）
- 入ったとき自宅が登録済みなら `easeTo`（自宅、zoom 15）。未登録ならカメラはそのまま
- 「戻る」→ `edit`。ポップアップを閉じる。保存しない
- ナビ中は入れない（入口がボトムシートにしかない）

## 探索

- 自動。出発地 + 到着地が揃った時点、および地点・経由地・順序・有料トグルの変更のたびに再探索
- 飛行中リクエストは `AbortController` で中断してから次を投げる。中断はトーストしない
- ローディング表示: サマリ行にスピナー 1 個
- 経由地なし → `alternative_route` 最大 3 本、あり → 1 本（[route-model.md](route-model.md) の契約）
- 新しい経路が返ったら `fitBounds`（下パディング = シートのピーク高さ）。代替切替・トグル変更・再探索の結果でもカメラは動かさない（「新しい経路」= 地点集合が変わった探索のみ）。実装は `fitVersion` カウンタ（App が地点集合の変化を検知して増やし、Map が `useEffect` で fit）
- 失敗（400 / ネットワーク）→ トースト 1 種「経路を探索できません」。経路表示は空にする

## 経路レイヤー

GeoJSON source 2 つ、line layer 3 つ。描画分割は [route-model.md](route-model.md)。

| source  | layer          | 内容                            | 見た目                               |
| ------- | -------------- | ------------------------------- | ------------------------------------ |
| `alt`   | `alt-line`     | 非選択の代替経路（全区間 1 本） | 青、薄い、細い                       |
| `route` | `route-wide`   | 選択経路の広い道区間            | 青 実線                              |
| `route` | `route-narrow` | 選択経路の細い道区間            | オレンジ 破線、`route-wide` より太い |

`route` source の feature は `kind` プロパティで filter。短区間無視は描画に適用しない。

## 状態（App.tsx）

`useState` を関心ごとに分ける。reducer は使わない。

```ts
type Point = { lat: number; lng: number; label: string | null }; // label null = 逆ジオ中

const [mode, setMode] = useState<"edit" | "nav" | "home">("edit");
const [from, setFrom] = useState<Point | null>(null);
const [to, setTo] = useState<Point | null>(null);
const [vias, setVias] = useState<Point[]>([]);
const [notoll, setNotoll] = useState(true);
const [result, setResult] = useState<{ key: string; routes: RouteModel[] } | null>(null); // 探索結果 + リクエストキー
const [selected, setSelected] = useState(0); // routes の index
const [fix, setFix] = useState<Fix | null>(null); // 最新 GPS fix
const [gpsError, setGpsError] = useState(false);
const [muted, setMuted] = useState(false); // セッション内のみ
const [nav, setNav] = useState<NavState | null>(null); // nav.md
const [toast, setToast] = useState<string | null>(null);
const [fitVersion, setFitVersion] = useState(0); // fitBounds トリガ
const [sheetExpanded, setSheetExpanded] = useState(false);
const [popup, setPopup] = useState<{ p: LatLng; label: string | null } | null>(null); // 地図タップ専用
const [hud, setHud] = useState<{ instruction: Instruction | null; remaining: number } | null>(null);
const [inNarrow, setInNarrow] = useState(false);
const [home, setHome] = useState<SavedPoint | null>(loadHome); // 自宅。更新時に saveHome
const [history, setHistory] = useState<SavedPoint[]>(loadHistory); // 検索履歴（新しい順、最大 5）。更新時に saveHistory
```

- `fix` `gpsError` は `useGeolocation()` の戻り値
- `home` `history` は `localStorage`（[modules.md](modules.md) の `saved.ts`）。URL には入れない
- 派生値（`useMemo`）: 選択中 `RouteModel`、各経路の細い道区間（`NarrowSegment[][]`）、サマリ数値、URL クエリ
- URL: `from` `to` `vias` `notoll` の変更で `history.replaceState`。初期化時にクエリから復元し探索（不正な地点は無視、`via` 先頭 5 件。parse 規則は [modules.md](modules.md)）。ナビ開始で出発地が現在地に置換されたときも更新する
- 探索は `useEffect([pointsKey, reqKey])`。`pointsKey` = 地点座標の文字列化（label 変化で再探索しない）、`reqKey` = `pointsKey` + notoll。cleanup で `abort()`
- `routes` `loading` は派生値: `routes` = 地点が揃い `result.key === reqKey` のときだけ `result.routes`、それ以外 `[]`。`loading` = 地点が揃い `result.key !== reqKey`。effect 内で同期 setState しない（地点欠けで即空になる）

## トースト

1 つだけ。新しいメッセージで置換。4 秒で自動消去。画面上部（ナビ中は NavHud の下）。

## PWA

`manifest.json`（`display: standalone`、アイコン 1 枚）。Service Worker なし。更新は `useUpdateCheck`（[modules.md](modules.md)）が visible 復帰時に検知して reload（ナビ中は終了後）。

## 帰属表示

MapLibre `AttributionControl`（compact）に「© OpenStreetMap contributors, © OpenFreeMap」。検索候補リストの末尾に出典を小さく表示（その出典の候補が出ている間のみ。両方あれば 2 行）。住所検索は「出典: 国土地理院」、施設名検索は「Webサービス by Yahoo! JAPAN」（`https://developer.yahoo.co.jp/sitemap/` へのテキストリンク。Yahoo のクレジット表示ガイドラインの公式スニペット A をそのまま使い、色・サイズを CSS で変えない）。
