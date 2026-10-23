# easy-road-nav

運転初心者向けの Web 地図ナビアプリ。対象は日本国内の自動車のみで、スマホとタブレットのブラウザで使う。

所要時間を最短にする経路は、住宅街の抜け道やすれ違いの難しい道を通りがちで、運転に慣れていない人には負担が大きい。easy-road-nav はセンターラインのある道（OSM の `tertiary` 以上。このリポジトリでは「広い道」と呼ぶ）を優先して経路を組む。避けきれない細い道は、地図上で色を変え、ナビ中は手前で画面と音声で知らせる。

自分用の小規模プロジェクトで、公開 URL はない。VPS 上のアプリには Tailscale の tailnet からだけ接続できる。

## できること

- 広い道を優先した経路探索。有料道路を避ける設定と、経由地（最大 5 か所）の指定ができる
- 細い道区間の明示。地図ではオレンジの破線で描き、案内文リストには「⚠ 細い道」を付ける
- ターンバイターンのナビ。現在地追従、音声案内、経路を外れたときのリルートを備える
- 地点の指定は、住所検索（国土地理院）、施設名検索（Yahoo! ローカルサーチ）、地図タップ、現在地から選べる。自宅登録と検索履歴もある
- 出発地・到着地・経由地を URL に載せて共有できる

「広い道」「細い道」の正確な定義と、経路のコストに掛けている重みは [docs/CONTEXT.md](docs/CONTEXT.md) にある。

## 構成

フロントエンドは Vite + React + TypeScript + MapLibre GL JS の静的サイトで、スタイルに StyleX、状態管理に zustand を使う。経路探索は GraphHopper 11 をセルフホストし、フロントから `/gh/*` 経由で呼ぶ。地図タイルは OpenFreeMap から取得する。

道路データは Geofabrik の OSM 抽出から関東 1 都 6 県と、山梨・長野・新潟・静岡の 4 県を切り出して使う。GraphHopper のグラフ（graph-cache）は Mac で生成して VPS へ転送する。VPS はメモリ 2 GB しかなく、取り込みに必要なヒープを確保できないためである。

構成図と各部品の選定理由は [docs/requirements/infrastructure.md](docs/requirements/infrastructure.md) にまとめてある。

## ローカルで動かす

必要なもの:

- Node.js 24
- Docker（GraphHopper の取り込みと起動に使う）
- osmium-tool（道路データの切り出しに使う。`brew install osmium-tool`）

初回は道路データとグラフを用意する。グラフの生成には 20 分ほどかかる。

```sh
npm ci
make pbf      # Geofabrik から取得して県を切り出し、data/kanto-koshinetsu.osm.pbf を作る
make import   # data/graph-cache を生成する
```

施設名検索を使うなら、Yahoo! デベロッパーネットワークで Client ID を取得し、リポジトリ直下の `.env.local` に書く。取得手順は [docs/runbook.md](docs/runbook.md) の 6 章にある。未設定でも、施設名検索以外の機能は動く。

```sh
echo 'VITE_YAHOO_APPID=<Client ID>' > .env.local
```

あとは `make dev` で GraphHopper（:8989）と Vite の開発サーバーが起動する。Vite が `/gh` を GraphHopper へプロキシするので、ブラウザで開けばそのまま経路探索まで試せる。

スマホ実機で確かめるには一手間かかる。現在地の取得には HTTPS が必須なので、Mac を tailnet に入れ、`tailscale serve --bg 5173` で開発サーバーを `https://<mac>.<tailnet>.ts.net` に公開する。

## よく使うコマンド

- `make dev` — GraphHopper と Vite の開発サーバーを起動
- `make check` — 型検査、lint、テストをまとめて実行
- `make down` / `make logs` — GraphHopper の停止とログ追従
- `npm run fmt` — oxfmt で整形
- `npm run build` — 型検査と本番ビルド

`make help` で Makefile のターゲットがすべて出る。CI（GitHub Actions）では、整形チェック、lint、テスト、ビルドを push ごとに実行している。

## ドキュメント

要件、設計、決定記録（ADR）の一覧は [docs/README.md](docs/README.md) から辿れる。コードを読む前に目を通すなら、次の 3 つを勧める。

- [docs/CONTEXT.md](docs/CONTEXT.md) — 用語集。「広い道」「細い道」の定義と、実走で調整する値の置き場
- [docs/requirements/frontend.md](docs/requirements/frontend.md) — `src/` のディレクトリ方針とコーディング規約
- [docs/design/route-model.md](docs/design/route-model.md) — GraphHopper の応答をフロントでどう扱うか
