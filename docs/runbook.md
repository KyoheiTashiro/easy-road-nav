# runbook

手順書。設計と理由は [requirements/infrastructure.md](requirements/infrastructure.md)。
コマンド・ファイル名は実装時に確定したら更新する。

## 1. VPS 初期構築

1. VPS 事業者のコントロールパネルで作成（Claude のブラウザ代行は課金・SG 操作として拒否される → コントロールパネル操作はユーザー）
   - セキュリティグループ `easy-road-nav`: UDP 41641 IP `*` + 一時的に TCP 22 IP `*`（`*` = 全許可。先にセキュリティ > セキュリティグループで作る）
   - インスタンス: OS Ubuntu Server 26.04 LTS、セットアップ「Docker CE」（docker + compose plugin が入る）、2 コア / 2 GB / 200 GB 日額（¥28/日）、ログイン用認証キー（新規作成・秘密鍵を保存）、上の SG、コンソールパスワード
   - ログインユーザーは `ubuntu`（sudo 付き。root ログインは既定で無効）
2. `ssh -i <鍵> ubuntu@<IP>` → `scripts/vps-setup.sh` を転送して実行（swap・docker グループ・Tailscale・unattended-upgrades・`/srv/easy-road-nav`・`tailscale serve` を一括。runbook 旧 2〜5・8〜10 相当）
   - `tailscale up --ssh` で出る認証 URL をブラウザで開く
3. （スクリプトが実施）swap 2 GB `/swapfile`
4. （スクリプトが実施）`docker` グループ追加
5. （スクリプトが実施）Tailscale 導入 → `tailscale up --ssh` → `tailscale set --auto-update`
6. Tailscale 管理画面（tailnet: `<tailnet>.ts.net`）
   - DNS: MagicDNS（既定で有効）+ HTTPS Certificates を Enable（済 2026-10-14）
   - Access controls > JSON editor（`grants` 構文）:

     ```jsonc
     {
       "grants": [
         { "src": ["autogroup:member"], "dst": ["*"], "ip": ["*"] },
         { "src": ["autogroup:shared"], "dst": ["*"], "ip": ["tcp:443"] },
       ],
       "ssh": [
         {
           "action": "check",
           "src": ["autogroup:member"],
           "dst": ["autogroup:self"],
           "users": ["autogroup:nonroot", "root"],
         },
       ],
     }
     ```

   - Machines > `easy-road-nav` > Share → 共有先のメール宛リンク。共有先はスマホに Tailscale アプリ + 自分のアカウントで受諾
7. Tailscale SSH でログインできることを確認してから、VPS 事業者のセキュリティグループ `easy-road-nav` の TCP 22 行を削除（inbound は UDP 41641 のみ）
8. （スクリプトが実施）`unattended-upgrades` 有効化。`Unattended-Upgrade::Automatic-Reboot "true"`、`Automatic-Reboot-Time "04:00"`（タイムゾーンは JST に設定）
9. （スクリプトが実施）`sudo mkdir -p /srv/easy-road-nav/{web,data} && sudo chown -R $USER /srv/easy-road-nav`（compose が `./data` を mount するので graph-cache は `data/` 配下）
10. （スクリプトが実施）`tailscale serve`（設定は tailscaled が永続化、再起動後も残る）

    ```sh
    tailscale serve --bg --set-path / /srv/easy-road-nav/web
    tailscale serve --bg --set-path /gh http://127.0.0.1:8989
    ```

11. 共有先の端末から `https://easy-road-nav.<tailnet>.ts.net/` に到達できることを確認（短縮名は不可、FQDN のみ）

## 2. デプロイ

どちらも `VPS_HOST=ubuntu@easy-road-nav.<tailnet>.ts.net` を環境変数で渡す（未設定なら即エラー）。接続は Tailscale SSH なので鍵不要（check モードのため、初回・一定期間ごとにブラウザ再認証 URL が出る）。

### web

```sh
VPS_HOST=ubuntu@easy-road-nav.<tailnet>.ts.net npm run deploy
```

= `npm run build`（`tsc --noEmit && vite build`）→ `rsync -az --delete dist/ $VPS_HOST:/srv/easy-road-nav/web/`。

ビルド前に Mac のリポジトリ直下に `.env.local` が要る（6 章）。無いままビルドすると施設名検索だけが「施設検索に失敗しました」になる。

### graph-cache + GraphHopper 設定

```sh
VPS_HOST=ubuntu@easy-road-nav.<tailnet>.ts.net npm run deploy:graph
```

= `scripts/deploy-graph.sh`。中身:

1. `rsync -az --delete data/graph-cache/ $VPS_HOST:/srv/easy-road-nav/data/graph-cache.new/`
2. `rsync -az --delete graphhopper/` と `rsync -az compose.yml` を `/srv/easy-road-nav/` へ
3. VPS で `docker compose --profile serve down`
4. `mv data/graph-cache data/graph-cache.old && mv data/graph-cache.new data/graph-cache`
5. `docker compose up -d serve`
6. `/info` を 2 秒間隔・最大 60 秒待つ。返れば `rm -rf data/graph-cache.old` で終了
7. 返らなければ `down` → `graph-cache.old` を戻す → `up -d serve`、exit 1

停止は 3〜5 の間、数十秒。失敗時は自動で旧 graph-cache に戻る。

## 3. データ更新 / custom model 変更

1. データ更新のみ: `make pbf`（Geofabrik から関東・中部を取得 → 山梨・長野・新潟・静岡を切り出し → 結合。`osmium-tool` が要る: `brew install osmium-tool`）。custom model 変更のみ（ペナルティ・速度係数とも）: `graphhopper/custom_models/*.json` を編集（pbf 再取得不要）。CH は custom model から作るので、どちらも再インポートが要る
2. Mac でインポート（CH 2 プロファイル込み、十数分）

   ```sh
   rm -rf data/graph-cache
   docker compose --profile import run --rm import
   ```

   graph-cache が空のまま exit 137 で終わったら Docker VM のメモリ不足。同居する他プロジェクトのコンテナを止めて再実行

3. Mac の `serve` で動作確認。`serve` が起動中だと `up -d` は何もせず旧 graph-cache を掴んだままなので `--force-recreate` を付ける。`/info` の `import_date` が今の時刻なら新しい graph-cache

   ```sh
   docker compose up -d --force-recreate serve
   ```

4. `npm run deploy:graph`
5. 調整値を変えた場合は `docs/CONTEXT.md` を更新

## 4. GraphHopper バージョン更新

1. `compose.yml` の anchor の tag を上げる（1 箇所）
2. `graphhopper/config.yml` を新バージョンの変更点に合わせる
3. 3 章の手順で再インポート → `deploy:graph`。graph-cache はバージョン間で互換しない前提。`compose.yml` も一緒に転送されるので VPS 側の tag も揃う

## 5. 地域追加・全国化

1. 県を足す: Nominatim から県境 GeoJSON を取得して `scripts/regions/` に置く（`https://nominatim.openstreetmap.org/search?q=<県名>&format=geojson&polygon_geojson=1&polygon_threshold=0.0005&limit=1`、Feature 1 件に整形）。`scripts/regions/extract.json` の extracts と `scripts/build-pbf.sh` の取得リージョン・`osmium merge` の引数に加える。設定画面の「対応地域」（`src/ui/edit/Settings.tsx` の `REGIONS`）と [infrastructure.md](requirements/infrastructure.md)「開発環境」の県一覧も更新
2. 3 章の手順。`deploy:graph` の前に Mac で `make heap-check` を回し、`mem_limit 1.5g` に収まるか見る（関東甲信越 + 静岡で 1.30 GiB、86 %。残り 200 MB が追加できる目安。超えたら全国化と同じく VPS 増設）
3. 全国化: `japan-latest.osm.pbf`（2.4 GB）に差し替え。RAM 8 GB 必要 → VPS プランを 8 GB（¥3,410）へ変更してから `deploy:graph`

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

3. `npm run dev` で施設名検索（Enter）が動くことを確認してから `npm run deploy`
4. 発行済み ID の確認・削除は <https://e.developer.yahoo.co.jp/dashboard/>。1 年以上使わないアプリは削除されることがある（再登録で復帰）
