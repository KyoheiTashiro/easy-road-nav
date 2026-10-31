# runbook

手順書。設計と理由は [requirements/infrastructure.md](requirements/infrastructure.md)。
コマンド・ファイル名は実装時に確定したら更新する。

## 1. VPS 初期構築

1. VPS 事業者のコントロールパネルで作成（Claude のブラウザ代行は課金・SG 操作として拒否される → コントロールパネル操作はユーザー）
   - セキュリティグループ `easy-road-nav`: UDP 41641 IP `*` + 一時的に TCP 22 IP `*`（`*` = 全許可。先にセキュリティ > セキュリティグループで作る）
   - インスタンス: OS Ubuntu Server 26.04 LTS、セットアップ「Docker CE」（docker + compose plugin が入る）、2 コア / 2 GB / 200 GB 日額（¥28/日）、ログイン用認証キー（新規作成・秘密鍵を保存）、上の SG、コンソールパスワード
   - ログインユーザーは `ubuntu`（sudo 付き。root ログインは既定で無効）
2. `ssh -i <鍵> ubuntu@<IP>` → `scripts/vps-setup.sh`・`scripts/vps-ci-user.sh`・`scripts/swap-web.sh`・`scripts/swap-graph.sh` の 4 つを同じディレクトリに scp して `sh vps-setup.sh`（swap・Tailscale・unattended-upgrades・`/srv/easy-road-nav` と `deploy` ユーザー・`tailscale serve` を一括。runbook 旧 2〜5・8〜10 相当）
   - `tailscale up --ssh` で出る認証 URL をブラウザで開く
3. （スクリプトが実施）swap 2 GB `/swapfile`
4. （スクリプトが実施）`docker` が入っていることの確認（VPS 事業者のセットアップ「Docker CE」で導入済み。`ubuntu` を docker グループには入れない。compose は入替スクリプトが root で動かす）
5. （スクリプトが実施）Tailscale 導入 → `tailscale up --ssh` → `tailscale set --auto-update`
6. Tailscale 管理画面（tailnet: `<tailnet>.ts.net`）
   - DNS: MagicDNS（既定で有効）+ HTTPS Certificates を Enable（済 2026-10-14）
   - Access controls > JSON editor（`grants` 構文）:

     ```jsonc
     {
       "grants": [
         { "src": ["autogroup:member"], "dst": ["*"], "ip": ["*"] },
         { "src": ["autogroup:shared"], "dst": ["*"], "ip": ["tcp:443"] },
         { "src": ["tag:ci"], "dst": ["tag:easy-road-nav"], "ip": ["tcp:22"] },
       ],
       "tagOwners": {
         "tag:easy-road-nav": ["autogroup:admin"],
         "tag:ci": ["autogroup:admin"],
       },
       "ssh": [
         {
           "action": "check",
           "src": ["autogroup:member"],
           "dst": ["autogroup:self"],
           "users": ["autogroup:nonroot", "root"],
         },
         {
           "action": "check",
           "src": ["autogroup:member"],
           "dst": ["tag:easy-road-nav"],
           "users": ["autogroup:nonroot", "root"],
         },
         {
           "action": "accept",
           "src": ["tag:ci"],
           "dst": ["tag:easy-road-nav"],
           "users": ["deploy"],
         },
       ],
     }
     ```

     `tag:ci` は GitHub Actions のランナー（一時ノード）。届く先は VPS の SSH だけ、入れるユーザーは `deploy` だけ。check だとブラウザ認証が要るので accept にする

   - Machines > `easy-road-nav` > Edit ACL tags → `tag:easy-road-nav`。タグは VPS だけに付ける（Mac に付けると `autogroup:member` から外れ、SSH も grants も当たらなくなる）
   - Settings > OAuth clients（Trust credentials と表示されることもある）> Generate: スコープ Keys > Auth Keys の Write、タグ `tag:ci`。Client ID と Secret を控える（Secret はこの画面でしか見られない）。期限切れなし。漏れても発行できるのは `tag:ci` のキーだけで、被害は web と graph-cache の差し替えまで（`web/` と `graphhopper/` は root 所有で、入替スクリプトが symlink を拒否する）
   - Machines > `easy-road-nav` > Share → 共有先のメール宛リンク。共有先はスマホに Tailscale アプリ + 自分のアカウントで受諾
7. Tailscale SSH でログインできることを確認してから、VPS 事業者のセキュリティグループ `easy-road-nav` の TCP 22 行を削除（inbound は UDP 41641 のみ）
8. （スクリプトが実施）`unattended-upgrades` 有効化。`Unattended-Upgrade::Automatic-Reboot "true"`、`Automatic-Reboot-Time "04:00"`（タイムゾーンは JST に設定）
9. （スクリプトが実施。`vps-ci-user.sh`）CI 用ユーザー `deploy`（sudo の一般権限なし・docker グループなし）、`/srv/easy-road-nav` の所有者、入替スクリプト、sudoers
   - `/srv/easy-road-nav` 自体・`compose.yml`・`graphhopper/`・`web/` は root、`web.new/` `data/` `graphhopper.new/` は `deploy`（compose が `./data` を mount するので graph-cache は `data/` 配下）。`web/` を root にするのは、root で動く `tailscale serve` が配信するツリーに `deploy` が symlink を置けないようにするため
   - `swap-web.sh` を `/usr/local/sbin/easy-road-nav-swap-web`、`swap-graph.sh` を `/usr/local/sbin/easy-road-nav-swap-graph` に置き、`deploy` に引数なし・パスワードなしの sudo 実行だけを許す（`/etc/sudoers.d/easy-road-nav-swap`）
   - 確認: `sudo -l -U deploy` に入替スクリプトの 2 行だけが出る。`ls -ld /srv/easy-road-nav /srv/easy-road-nav/*` の所有者が上のとおり
   - 入替スクリプトを変えたときは、4 ファイルを scp し直して `sh vps-ci-user.sh` を再実行（workflow は VPS 上のスクリプトを更新しない）
10. （スクリプトが実施）`tailscale serve`（設定は tailscaled が永続化、再起動後も残る）

    ```sh
    tailscale serve --bg --set-path / /srv/easy-road-nav/web
    tailscale serve --bg --set-path /gh http://127.0.0.1:8989
    ```

11. 共有先の端末から `https://easy-road-nav.<tailnet>.ts.net/` に到達できることを確認（短縮名は不可、FQDN のみ）
12. GitHub のリポジトリ画面（`gh` は使わない）: Settings > Environments > New environment で `production` を作る。Deployment branches and tags を「Selected branches and tags」にして `main` を足す。Environment secrets に次の 4 つを登録（リポジトリ全体の Secrets ではなく Environment 側）
    - `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET`: 手順 6 の OAuth クライアント
    - `VPS_HOST`: `deploy@easy-road-nav.<tailnet>.ts.net`
    - `VITE_YAHOO_APPID`: 6 章の Client ID

## 2. デプロイ

main に push すると GitHub Actions が VPS へ反映する。Mac から打つのは Actions が使えないときだけ。

- **Deploy web**（`.github/workflows/deploy-web.yml`）: main への push で発火。`docs/**` と `**.md` だけの変更では動かない。`npm ci` → `npm test` → `npm run deploy`（build + rsync + 入替）。テストか型検査が落ちたら転送しない
- **Deploy graph**（`.github/workflows/deploy-graph.yml`）: main への push のうち `graphhopper/**`・`compose.yml`・`scripts/build-pbf.sh`・`scripts/regions/**`・`scripts/deploy-graph.sh` が変わったとき、または Actions タブの Run workflow（`workflow_dispatch`）。ランナーで `make pbf` → `make import` → `scripts/deploy-graph.sh`。pbf は毎回 Geofabrik の最新を取る。`timeout-minutes` 90
- ランナーは `tailscale/github-action` で `tag:ci` の一時ノードとして tailnet に入り、`deploy@` で VPS に SSH する。Secrets は 1 章 12 の Environment `production`
- web と graph は `concurrency` のグループが別（`deploy-web` / `deploy-graph`、`cancel-in-progress: false`）。同じ push に両方が入れば web が先に終わる。フロントが呼ぶプロファイルを足すときは graph 側を先に push し、Deploy graph が終わってからフロントを push する。消すときは逆
- 実行結果は Actions タブで見る。graph の入替ログは VPS の `/var/log/easy-road-nav-swap-graph.log`（`ssh ubuntu@... sudo cat`）

### 手動デプロイ（障害時）

どちらも `VPS_HOST=deploy@easy-road-nav.<tailnet>.ts.net` を環境変数で渡す（未設定なら即エラー）。接続は Tailscale SSH なので鍵不要（check モードのため、初回・一定期間ごとにブラウザ再認証 URL が出る）。`ubuntu@` では書き込み権限がなく失敗する。

#### web

```sh
VPS_HOST=deploy@easy-road-nav.<tailnet>.ts.net npm run deploy
```

= `npm run build`（`tsc --noEmit && vite build`）→ `scripts/deploy-web.sh`。中身:

1. `rsync -az --delete dist/ $VPS_HOST:/srv/easy-road-nav/web.new/`
2. `ssh $VPS_HOST sudo -n /usr/local/sbin/easy-road-nav-swap-web`（VPS の入替スクリプト `scripts/swap-web.sh`。root で動く。`web.new/` を root 所有の `web.next/` にコピーし、通常のファイルとディレクトリ以外があれば中止 → `web/` と入れ替え）

ビルド前に Mac のリポジトリ直下に `.env.local` が要る（6 章）。無いままビルドすると施設名検索だけが「施設検索に失敗しました」になる。

#### graph-cache + GraphHopper 設定

```sh
VPS_HOST=deploy@easy-road-nav.<tailnet>.ts.net npm run deploy:graph
```

= `scripts/deploy-graph.sh`。Mac の `data/graph-cache` をそのまま送る（3 章 2 で作る）。中身:

1. `rsync -az --delete data/graph-cache/ $VPS_HOST:/srv/easy-road-nav/data/graph-cache.new/`
2. `rsync -az --delete graphhopper/ $VPS_HOST:/srv/easy-road-nav/graphhopper.new/`。`compose.yml` は送らない
3. `ssh $VPS_HOST sudo -n /usr/local/sbin/easy-road-nav-swap-graph`（VPS の入替スクリプト。root で動く）

入替スクリプト（`scripts/swap-graph.sh`）の中身:

1. 自分を systemd の一時ユニット `easy-road-nav-swap-graph` として動かし直す。ssh が切れても最後まで走り、出力は `/var/log/easy-road-nav-swap-graph.log` に残る。前の入替が走っている間は起動しない
2. `graphhopper.new/` を root 所有の `graphhopper.next/` にコピーし、通常のファイルとディレクトリ以外（symlink 等）があれば中止
3. `git ls-remote` で main の先頭コミットを調べ、そのコミットの `compose.yml` を `raw.githubusercontent.com` から取る（`deploy` から受け取らない。`main` 名で取ると CDN キャッシュで古いことがある）
4. `docker compose down`（コンテナが残っていれば中止。旧 `compose.yml` の `serve` に `profiles` が付いていた間は down が無言で素通りしていた）→ `compose.yml`・`graphhopper/`・`data/graph-cache` を `.old` に退避 → 新しいものに入れ替え → `docker compose up -d serve`
5. `/info` を 2 秒間隔・最大 60 秒待つ。返れば `serve OK (<commit>)` を出して `.old` を消す
6. 返らなければ `down` → 3 つとも `.old` を戻す → `up -d serve`、exit 1

停止は 4〜5 の間、数十秒。失敗時は `compose.yml` ごと旧状態に戻る。

## 3. データ更新 / custom model 変更

1. custom model 変更（ペナルティ・速度係数とも）: `graphhopper/custom_models/*.json` を編集して main に push。Deploy graph が発火し、ランナーが pbf 取得から入替までやる。調整値を変えた場合は `docs/CONTEXT.md` も更新
2. データ更新のみ（リポジトリに変更なし）: Actions タブで Deploy graph を選び、Run workflow から main で実行。pbf は毎回最新を取るので、custom model の push でもデータは更新される
3. push の前に Mac で確かめたいとき:
   - `make pbf`（Geofabrik から関東・中部を取得 → 山梨・長野・新潟・静岡を切り出し → 結合。`osmium-tool` が要る: `brew install osmium-tool`）。custom model 変更だけなら pbf 再取得は不要だが、CH は custom model から作るので再インポートは要る
   - `make import`（CH 2 プロファイル込み、十数分）。graph-cache が空のまま exit 137 で終わったら Docker VM のメモリ不足。同居する他プロジェクトのコンテナを止めて再実行
   - `docker compose up -d --force-recreate serve` で動作確認。`serve` が起動中だと `up -d` は何もせず旧 graph-cache を掴んだままなので `--force-recreate` を付ける。`/info` の `import_date` が今の時刻なら新しい graph-cache

## 4. GraphHopper バージョン更新

1. `compose.yml` の `x-common` の image tag を上げる（1 箇所）
2. `graphhopper/config.yml` を新バージョンの変更点に合わせる
3. main に push → Deploy graph。graph-cache はバージョン間で互換しない前提。`compose.yml` は入替スクリプトが main から取るので VPS 側の tag も揃う。Mac の `serve` も次の `make import` で新 tag になる

## 5. 地域追加・全国化

1. 県を足す: Nominatim から県境 GeoJSON を取得して `scripts/regions/` に置く（`https://nominatim.openstreetmap.org/search?q=<県名>&format=geojson&polygon_geojson=1&polygon_threshold=0.0005&limit=1`、Feature 1 件に整形）。`scripts/regions/extract.json` の extracts と `scripts/build-pbf.sh` の取得リージョン・`osmium merge` の引数に加える。設定画面の「対応地域」（`src/settings/Settings.tsx` の `REGIONS`）と [infrastructure.md](requirements/infrastructure.md)「開発環境」の県一覧も更新
2. push の前に Mac で 3 章 3 の手順で graph-cache を作り、`make heap-check` を回して `mem_limit 1.5g` に収まるか見る（関東甲信越 + 静岡で 1.30 GiB、86 %。残り 200 MB が追加できる目安。超えたら全国化と同じく VPS 増設）。入替スクリプトの `/info` 確認は起動失敗しか拾えず、配信中のヒープ不足は防げない
3. 収まれば push → Deploy graph
4. 全国化: `japan-latest.osm.pbf`（2.4 GB）に差し替え。RAM 8 GB 必要 → VPS プランを 8 GB（¥3,410）へ変更してから push

## 6. Yahoo! ローカルサーチ API の appid（初回のみ）

1. Yahoo! JAPAN ID でログインし、<https://e.developer.yahoo.co.jp/register> でアプリケーションを登録。Client ID が発行される（1 ID で 10 アプリまで）。フォームの項目と入れる値:
   - ID連携利用有無: 「ID連携を利用しない」（YOLP だけならこちら。登録後は変更不可）
   - 利用者情報: 「個人」（登録後は変更不可）
   - 個人情報提供先としてユーザーへ開示することに同意: ID 連携を使わないので実質無関係。「同意する」は取り消せない
   - 契約者住所の国または地域: 「日本」（登録後は変更不可）
   - アプリケーション名: `easy-road-nav`
   - サイト URL: `https://easy-road-nav.<tailnet>.ts.net/`（任意項目。フォームの説明では「利用者同意画面に表示」のみ）
   - アプリケーションの説明: 自分用の経路案内アプリで施設名検索に使う旨を一文
   - 利用規約への同意にチェック → 「確認」→ 登録
2. Mac のリポジトリ直下に `.env.local` を作る（gitignore 済み）

   ```sh
   echo 'VITE_YAHOO_APPID=<Client ID>' > .env.local
   ```

3. `npm run dev` で施設名検索（Enter）が動くことを確認
4. 同じ値を GitHub の Environment `production` の secret `VITE_YAHOO_APPID` にも登録する（1 章 12）。Deploy web はこれをビルド時の環境変数として渡す
5. 発行済み ID の確認・削除は <https://e.developer.yahoo.co.jp/dashboard/>。1 年以上使わないアプリは削除されることがある（再登録で復帰）
