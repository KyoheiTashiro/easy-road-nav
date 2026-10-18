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
         {"src": ["autogroup:member"], "dst": ["*"], "ip": ["*"]},
         {"src": ["autogroup:shared"], "dst": ["*"], "ip": ["tcp:443"]},
       ],
       "ssh": [
         {"action": "check", "src": ["autogroup:member"], "dst": ["autogroup:self"], "users": ["autogroup:nonroot", "root"]},
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

### graph-cache + GraphHopper 設定

```sh
VPS_HOST=ubuntu@easy-road-nav.<tailnet>.ts.net npm run deploy:graph
```

= `scripts/deploy-graph.sh`。中身:

1. `rsync -az --delete data/graph-cache/ $VPS_HOST:/srv/easy-road-nav/data/graph-cache.new/`
2. `rsync -az --delete graphhopper/` と `rsync -az compose.yml` を `/srv/easy-road-nav/` へ
3. VPS で `docker compose down`
4. `mv data/graph-cache data/graph-cache.old && mv data/graph-cache.new data/graph-cache`
5. `docker compose up -d serve`
6. `/info` を 2 秒間隔・最大 60 秒待つ。返れば `rm -rf data/graph-cache.old` で終了
7. 返らなければ `down` → `graph-cache.old` を戻す → `up -d serve`、exit 1

停止は 3〜5 の間、数十秒。失敗時は自動で旧 graph-cache に戻る。

## 3. データ更新 / custom model 変更

1. データ更新のみ: Geofabrik から `kanto-latest.osm.pbf` を `data/` に再取得。custom model 変更のみ: `graphhopper/custom_models/*.json` を編集（pbf 再取得不要）
2. Mac でインポート（CH 2 プロファイル込み、十数分）

   ```sh
   rm -rf data/graph-cache
   docker compose --profile import run --rm import
   ```

3. Mac の `serve` で動作確認

   ```sh
   docker compose up -d serve
   ```

4. `npm run deploy:graph`
5. 調整値を変えた場合は `docs/CONTEXT.md` を更新

## 4. GraphHopper バージョン更新

1. `compose.yml` の anchor の tag を上げる（1 箇所）
2. `graphhopper/config.yml` を新バージョンの変更点に合わせる
3. 3 章の手順で再インポート → `deploy:graph`。graph-cache はバージョン間で互換しない前提。`compose.yml` も一緒に転送されるので VPS 側の tag も揃う

## 5. 地域追加・全国化

1. Geofabrik のサブリージョン pbf を追加取得、`osmium merge` で 1 ファイルに
2. 3 章の手順。全国は RAM 8 GB 必要 → VPS プランを 8 GB（¥3,410）へ変更してから `deploy:graph`
