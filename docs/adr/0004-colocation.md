# ADR-0004: src を機能別ディレクトリに再編し、関連物を同居させる

- 日付: 2026-10-23
- 状態: 採用

## 背景

`src/` は層で分かれている（`model/` `api/` `store/` `hooks/` `ui/`）。この分け方だと、1 つの機能を触るたびに複数のディレクトリを行き来することになる。細い道なら、区間の生成は `model/narrow.ts`、探索結果の保持は `store/trip.ts`、表示は `ui/edit/RouteSummary.tsx` と `ui/map/mapLayers.ts` に散っている。

調整値は 3 か所に重複している。`CONTEXT.md` の表、`src/model/tuning.ts`、`graphhopper/custom_models/*.json` である。ただし `tuning.ts` の 14 定数を調べると、どれも 1 ファイルからしか使われていない（`narrow.ts` 2、`progress.ts` 10、`route.ts` 1、`saved.ts` 1）。一か所に集めておく理由は、一覧できることしか残っていない。

テストは既に実装の隣にある。部品専用のフックも部品と同じディレクトリにある。残る「離れ」は、層別の配置と調整値の 2 つ。

## 検討した選択肢

- **機能別**: route / search / navigation / map / trip / settings。1 機能の純関数から UI までが 1 ディレクトリに入る
- **画面モード別**: 現 `ui/` の map / edit / navigation を最上位に上げ、model・store も各モードへ配る。`route.ts` や `narrow.ts` は 3 モードすべてが使うため、ほとんどが共有側に残り、分けた意味が薄い
- **層別のまま**: 共有物の位置だけ調整する。散在は解消しない

## 決定

機能別に再編する。

```
src/
  main.tsx
  App.tsx
  useGeolocation.ts       # trip と navigation の両方を更新する App 全体のフック
  useUpdateCheck.ts
  stylex.css
  shared/      point geo format timeout tokens.stylex button.stylex layout.stylex icons/ Toast.tsx toast.ts
  trip/        trip.ts(store) url.ts useUrlSync.ts
  route/       graphhopper.ts route.ts narrow.ts useRouteSearch.ts RouteSummary.tsx StepList.tsx __fixtures__/
  search/      gsi.ts yahoo.ts useSearch.ts SearchBox.tsx useReverseGeocode.ts
  navigation/  navigation.ts(store) progress.ts speech.ts useWakeLock.ts NavigationHud.tsx NavigationBar.tsx
  map/         現 ui/map/ のまま
  settings/    saved.ts(store) Settings.tsx
  sheet/       BottomSheet.tsx useSheetDrag.ts
```

テスト（`*.test.ts`）は従来どおり実装の隣に置く。

- 追記（2026-10-23、実施時）: `Toast.tsx` は `shared/` ではなく `src/` 直下に置いた。trip の `mode` を購読するので `shared/` に置くと機能への import になり、使うのも `App` だけだったため。store の `toast.ts` は各機能が呼ぶので `shared/` のまま
- 追記（2026-10-23、実施時）: `DirectionIcon` は `route/DirectionIcon.tsx` に分けた。GraphHopper の sign（`route.ts` の `SIGN`）に依存するため。SVG と共通部の `Icon` は `shared/icons/` に残した

### 配置

- 使う側が 1 つなら、使う側の隣に置く
- 複数の機能が使うなら、意味上の持ち主の機能に置く。`saved.ts`（自宅・検索履歴・アイコンのみ表示）は search・map・route・settings の UI と trip が使うが、持ち主は `settings/`
- どの機能にも属さないものは `shared/`。App 全体のフックは `App.tsx` と同じ `src/` 直下

fixture は GraphHopper の実応答で、route の契約そのものなので `route/__fixtures__/` に置く。`navigation/progress.test.ts` も使うため、厳密に「全利用者の共通祖先」で決めれば `src/` 直下になる。持ち主を優先して、ここは例外とする。

### React 非依存の境界

これまでは「`store/` と `model/` は React・DOM 非依存」をディレクトリで保っていた。再編後はファイル名で保つ。

- `*.tsx` と `use*.ts` 以外のファイルは、`react` `react-dom` を import しない
  - 追記（2026-10-23、実施時）: 当初は「React・DOM」と書いたが、store は zustand と localStorage を、`yahoo.ts` は `<script>` 挿入を、`mapLayers.ts` はマーカー DOM を使う。旧規約の「React・DOM 非依存」も実際は `react` を直接 import しない意味だったので、そのとおりに書き直した
- それらのファイルは、`*.tsx` と `use*.ts` を import しない
- Vitest の対象は、この React 非依存のファイル

### 依存方向

機能間の import は自由にする。trip は route と search を使い、route と search の UI は trip を使う。ディレクトリ単位で順序を決めると、この循環を解くために UI を別の機能へ寄せることになる。

制約は 2 つだけ。上の React 非依存の境界と、`shared/` から機能ディレクトリへの import 禁止。

### 調整値

コードを正とする。

- `tuning.ts` を削除し、各定数を利用ファイルの先頭に移す
- `CONTEXT.md` の調整値の表は、名前・意味・置き場だけを書く。値は書かない
- GraphHopper 側の値（細い道ペナルティ、有料ペナルティ、速度係数）は `graphhopper/custom_models/*.json` を正とする。両ファイルの先頭コメントにある「`CONTEXT.md`『〜』= 値」の記述も、値を外して合わせる

### 担保

規約を [frontend.md](../requirements/frontend.md) に書くだけにする。違反を検出するスクリプトや lint 設定は入れない。

## 影響

- `shared/icons/index.tsx` が `@/model/route.ts` の `SIGN` を import している。移動後は `shared/` → `route/` となり、`shared/` から機能への import 禁止に反する。`SIGN` を `shared/` に出すか、アイコンを `route/` 側へ寄せるかを実施時に決める
- 書き換える docs: `frontend.md`（方針・ディレクトリ・テスト）、`CONTEXT.md`（調整値の表、「`src/model/tuning.ts` を更新する」の記述）、`design/modules.md` ほか `src/` のパスを参照する箇所
- 撤廃する既存規約: 「依存方向は `ui/` `hooks/` `App` → `store/` → `api/` → `model/`」「`map/` `edit/` `navigation/` は互いに import しない」。前者は React 非依存の境界に、後者は機能間 import 自由に置き換わる
- ファイル移動は `git mv` で行い、履歴を追えるようにする。`@/` パスは一括置換
