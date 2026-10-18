# ナビ設計

要件は [navigation.md](../requirements/navigation.md)。ここでは状態機械・発話・カメラの「どう作るか」。調整値は [CONTEXT.md](../CONTEXT.md)。経路モデルは [route-model.md](route-model.md)。

## 開始手順（「案内開始」）

1. 前提: 経路あり、GPS fix あり（`ui.md` の有効条件）
2. 出発地を最新 fix の座標に置換（地点名は「現在地」）。経由地・到着地は維持
3. 再探索。`alternative_route` なし（1 本）。リルートと同じリクエスト形。選択していた代替経路は引き継がない
4. 応答で `nav` state を初期化、`mode = "nav"`
5. 発話「案内を開始します。この先 1.2 キロ、右方向です」（最初の案内地点までの距離 + 指示。距離の丸めは「発話」節）。この発話がユーザー操作直後の初回 `speechSynthesis.speak` になり iOS の制約を満たす
6. Wake Lock 取得。`visibilitychange` で `visible` に戻ったら再取得
7. カメラをナビ設定へ（「カメラ」節）

再探索失敗 → トースト、編集モードのまま。

## 状態

```ts
type Fix = { lat: number; lng: number; accuracy: number; t: number };

type NavState = {
  s: number; // 進捗（累積距離 m）。単調増加
  segmentIndex: number; // 進捗点が乗る線分
  heading: number | null; // 進行方向 deg。経路線の方位、経路外れ中は fix 方位
  lastFix: Fix | null; // 方位算出用
  announced: Set<string>; // 発火済みトリガ。key = `${種別}:${index}:${段階}` 例 "instr:12:300" "narrow:3" "via:1"
  passedVia: number; // 通過済み経由地数
  offRouteCount: number; // 経路外れ連続回数
  rerouting: boolean; // リルート要求中
  follow: boolean; // 地図追従
  zoom: number; // 現在のズーム（ピンチで更新、復帰時に維持）
};
```

`announced` は文字列 Set 1 つで全種別を持つ。リルートで全リセット。

## 純ロジック `step`（`src/model/progress.ts`）

```ts
type NavEvent =
  | { type: "speak"; text: string }
  | { type: "hud"; instruction: Instruction | null; remaining: number }
  | { type: "narrow"; segment: NarrowSegment | null } // 走行中バナー用。null = 細い道でない
  | { type: "viaPassed"; index: number }
  | { type: "arrived" }
  | { type: "reroute" };

function step(
  route: RouteModel,
  narrow: NarrowSegment[],
  state: NavState,
  fix: Fix,
): { state: NavState; events: NavEvent[] };
```

React・DOM 非依存。`App` が `useEffect([fix])` で呼び、events を発話・表示・fetch に変換する。テストは fix 列 → events 列で書く。処理順に書いていない境界条件（経路外れ中の `heading` 更新、複数経由地の同時通過、案内地点が残っていない場合等）は [modules.md](modules.md) の `progress.ts` 節。

処理順（1 fix ごと）:

1. **精度フィルタ**: `fix.accuracy >= 進捗採用精度` なら state を返すだけ（events 空）。マーカー位置は App が fix から直接描く
2. **最近傍点**: `nearest(route, fix)` → `{ s, distanceToRoute, segmentIndex }`（[route-model.md](route-model.md)）
3. **経路外れ判定**: `distanceToRoute > 経路外れ距離` なら `offRouteCount++`。`>= リルート連続回数` かつ `!rerouting` なら `reroute` event、`rerouting = true`。経路外れ中は進捗更新せず、`heading` は直近 2 fix の方位（移動 ≥ 方位算出最小移動 のときのみ更新）。以降の手順は飛ばす。経路内なら `offRouteCount = 0`
4. **進捗更新**: `s` は単調増加。`nearest.s < state.s` なら据え置き（後戻りは無視）。`heading` = 線分 `segmentIndex` の方位
5. **経由地通過**: `passedVia < viaIndices.length` かつ `s >= cum[viaIndices[passedVia]]` → `viaPassed`、発話「経由地を通過しました」、`passedVia++`
6. **到着**: `cum[n-1] - s < 到着判定` → 発話「目的地に到着しました」、`arrived`。以降の手順は飛ばす
7. **次の案内地点**: `instructions` のうち `sign != 0`（直進は案内地点にしない）かつ `cum[from] > s` の最初のもの。残り `r = cum[from] - s`
   - `r <= 50` かつ `"instr:i:50"` 未発火 → 直前案内。`"instr:i:300"` も発火済みにする（1 fix で両方飛び越えたら直前のみ）
   - それ以外で `r <= 300` かつ `"instr:i:300"` 未発火 → 予告。ただし直前の案内地点との間隔が 300 m 未満なら予告しない（直前案内だけ）
   - `hud` event は毎 fix
8. **細い道**: `narrow` 区間 j で `cum[seg.from] - s` が `(0, 細い道警告距離]` かつ `"narrow:j"` 未発火 → 警告発話。先頭区間（出発地に接する）は警告しない。末尾区間（到着地に接する）は「この先細い道、目的地付近です」。走行中判定: `cum[seg.from] <= s < cum[seg.to]` の区間を `narrow` event で通知
9. 同一 fix で 7 と 8 が両方発火したら発話順は 案内 → 細い道警告

## 発話（`src/nav/useSpeech.ts`）

`speechSynthesis`、`lang = "ja-JP"`、rate 1。キューは `speechSynthesis` 内蔵のもの（発話中は待って順に全部言う）。直前の文字列がまだ再生・待機中なら同一文字列は捨てる。ミュート中は `speak` event を捨てる（キューにも入れない）。iOS 向けに「案内開始」の click 内で空発話（`unlock`）してから再探索する。

テンプレ（sign → 語）:

| sign         | 語                                             |
| ------------ | ---------------------------------------------- |
| -8 / 8 / -98 | U ターン                                       |
| -7           | 左寄り                                         |
| 7            | 右寄り                                         |
| -3 / -2      | 左方向                                         |
| -1           | 斜め左                                         |
| 1            | 斜め右                                         |
| 2 / 3        | 右方向                                         |
| 6            | ラウンドアバウト n 番目の出口（`exit_number`） |
| 5            | 経由地                                         |
| 4            | 目的地                                         |
| 0            | （案内地点にしない）                           |

- 予告: 「300 メートル先、{語}です」
- 直前: 「まもなく{語}です」
- 開始時: 「案内を開始します。この先 {距離}、{語}です」。距離: 1 km 以上は 0.1 km 単位「1.2 キロ」、未満は 100 m 単位「300 メートル」
- 経由地通過: 「経由地を通過しました」
- 到着: 「目的地に到着しました」
- 細い道: 「この先、細い道です」「この先細い道、目的地付近です」
- リルート成功: 「経路を再探索しました」+ 新経路の開始時文言（「案内を開始します」は付けない）
- 道路名は読まない（HUD 表示のみ）

## NavHud

画面上部。

- 方向アイコン: インライン SVG 11 種（直進・斜め右・右・鋭角右・斜め左・左・鋭角左・右寄り・左寄り・U ターン・ラウンドアバウト）。`sign` で選ぶ。経由地・目的地はピンアイコン
- 残り距離: 1 km 以上「1.2 km」（0.1 km 単位）、未満「340 m」（10 m 単位）
- 道路名: `street_name`（空なら非表示）
- 細い道走行中: HUD 直下にオレンジのバナー「細い道を走行中」
- リルート要求中: バナー「再探索中…」。経路外れカウント中（1〜2 回目）は何も出さない

## 下部バー

残り時間（`formatDuration`: 「1 時間 20 分」「25 分」「1 分」）/ 到着予想「HH:MM」/ ミュートトグル / 「終了」（確認なし）/ 「現在地」（追従 OFF のときだけ表示）。

残り時間の算出: 現在の案内地点以降の `instructions[].time` 合計 + 現在位置が乗る指示の `time × (残り距離 / 指示距離)`。実速度は使わない。到着予想 = 現在時刻 + 残り時間。

## カメラ

- 開始時: `zoom 17`、`pitch 50`（`NAV_ZOOM` / `NAV_PITCH`、Map.tsx）、`bearing = heading`、`padding.top = 画面高 / 3`・`padding.bottom = NavBar 高` で現在地を画面下 1/3 に置く（`jumpTo({ padding })`。編集モード復帰で padding 0）
- 毎 fix（`follow` 中）: `easeTo({ center, bearing, zoom: state.zoom })`。`heading` が null なら bearing は据え置き
- ジェスチャ:
  - ドラッグ（`dragstart`、2 本指のピンチ中は除く）→ `follow = false`。「現在地」ボタンで `follow = true`、zoom はユーザーが変えた値を維持
  - ピンチ（`zoomend`、`originalEvent` あり）→ `state.zoom` を更新、`follow` は維持
  - 回転・ピッチ: `touchZoomRotate.disableRotation()`、`touchPitch.disable()`、`dragRotate.disable()`。編集モードに戻るとき復帰
- 編集モードのシート・検索欄はナビ中非表示。地点変更は「終了」してから

## リルート

1. `reroute` event → `rerouting = true`、バナー「再探索中…」
2. 出発地 = 現在地から `heading` 方向へ リルート前方オフセット だけ進めた点。`heading` が null（停車中に外れた等）なら現在地そのまま
3. `points` = [出発地, 未通過の経由地（`vias.slice(passedVia)`）, 到着地]。`profile` は現在の有料トグル。`alternative_route` なし
4. 成功: `routes = [新経路]`、`selected = 0`、`nav` を初期化（`s = 0`、`announced` 空、`passedVia = 0`、`follow`・`zoom`・`muted` は維持）。発話「経路を再探索しました」+ 開始時文言。`fitBounds` しない（追従継続）
5. 失敗（400 / ネットワーク）: トースト「経路を再探索できません」、`rerouting = false`、旧経路のまま案内継続。`offRouteCount = 0` に戻し、次の連続外れで再試行
6. 地点リスト（編集モードに戻ったとき）: 通過済み経由地は薄色 + 「通過済」表示で残す。URL の `via` は全経由地を維持

## 終了・到着

- 「終了」または `arrived`: `mode = "edit"`、`nav = null`、Wake Lock 解放、カメラのジェスチャ制限を解除、`fitBounds` で経路全体表示。`speechSynthesis.cancel()` は「終了」のみ（到着は「目的地に到着しました」を言い切る）
- 経路・地点はそのまま（再度「案内開始」可）。GPS watch と現在地マーカーはそのまま継続
- ミュート状態はセッション内のみ。リロードで解除

## テスト（`progress.test.ts`）

fixture 経路（[route-model.md](route-model.md)）上に fix 列を置き、events 列を検証する。

- 進捗の単調増加（後戻り fix で `s` 据え置き）
- 精度フィルタ（accuracy 50 m 以上で events 空）
- 予告 → 直前の順序、1 fix で飛び越えたとき直前のみ、指示間 300 m 未満で予告なし
- sign 0 を案内地点にしない
- 経由地通過、到着
- 細い道警告（先頭区間なし・末尾区間の文言・走行中バナー）
- 経路外れ連続回数で `reroute` 1 回だけ（`rerouting` 中は再発火しない）
- 発話順（案内 → 細い道）
