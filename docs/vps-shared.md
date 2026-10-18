# VPS に別アプリを同居させるときの変更点

現構成（[infrastructure.md](requirements/infrastructure.md)）は「VPS 1 台 = このアプリ 1 本」を前提に組んである。別アプリを載せるとき、その前提に寄りかかっている箇所を洗い出した。変えるのは入口・メモリ・初期構築スクリプトの 3 点で、残りはそのまま使える。

## 1. 入口（URL）— 1 ノード = 1 FQDN の制約

Tailscale は 1 ノードに 1 つの MagicDNS 名しか付かず、`tailscale serve` はその名前の 443 番で `/` と `/gh` を既に使っている。別アプリの入口は次の 3 通りから選ぶ。判断軸は「共有先に見せるか」。

| 方式                                                    | URL                                            | 共有先から見えるか                            | 向くケース                                     |
| ------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| A. パス追加 `tailscale serve --bg --set-path /app2 ...` | `https://easy-road-nav.<tailnet>.ts.net/app2/` | 見える（ACL は tcp:443 単位。パスで絞れない） | 共有先にも使わせるアプリ。ベースパス対応が必要 |
| B. 別ポート `tailscale serve --bg --https=8443 ...`     | `https://easy-road-nav.<tailnet>.ts.net:8443/` | 見えない（ACL が 443 のみ許可）               | 自分専用。最小手数                             |
| C. アプリの compose に Tailscale サイドカー（別ノード） | `https://app2.<tailnet>.ts.net/`               | 共有しなければ見えない                        | 固有の名前が欲しい、ルートで動かしたい         |

- A はアプリ側がサブパス配下で動く必要がある（Vite なら `base`、API なら prefix 剥がし後のパスで受ける）。`serve --set-path` は prefix を剥がして転送する（未文書化、`/gh` で確認済み）
- B はポート付き URL になるが、`autogroup:shared` に tcp:8443 を足さない限り共有先には届かない。自分専用アプリの既定はこれ
- C は `tailscale/tailscale` イメージを 1 サービス足す。auth key の管理と state ボリュームが増える。ルートで動かしたい・共有先に別名で配りたいときだけ
- ホスト名 `easy-road-nav` はこのアプリ名で、別アプリの URL にも残る。汎用名（`vps` 等）に変えるなら共有先へ URL を配る前（TODO の runbook 1 章 6 が未実施の今）しかない。変えると `VPS_HOST`・runbook・frontend.md の FQDN を全部書き換えるので、気にならなければ据え置き

## 2. メモリ — 2 GB は GraphHopper でほぼ埋まる

- GraphHopper `serve` は `mem_limit: 1.5g`。graph-cache 746 MB は MMAP なので OS ページキャッシュに乗る。空きメモリが多いほどキャッシュに残る量が増え、応答が速い
- 別アプリが常駐メモリを食うとページキャッシュが追い出され、GraphHopper は落ちずに遅くなる（ディスク読みに落ちる）。OOM ではないので気づきにくい
- 別アプリにも `mem_limit` を必ず付ける。載せたあと `free -m` の `buff/cache` が graph-cache サイズ（約 750 MB）を下回るなら 4 GB プラン（¥1,760）へ
- 目安: 別アプリの常駐が 200〜300 MB 以下なら 2 GB で試す。JVM・Rails・Postgres 級なら最初から 4 GB

## 3. 初期構築スクリプトは再実行しない

`scripts/vps-setup.sh` は共通部（swap・docker グループ・Tailscale・unattended-upgrades）とこのアプリ固有部（hostname・`/srv/easy-road-nav`・serve 設定）が 1 本に混ざっている。共通部は済んでいるので、別アプリ側の手順は固有部だけを自前で持つ:

```sh
sudo mkdir -p /srv/<app> && sudo chown -R $USER /srv/<app>
tailscale serve --bg --https=8443 --set-path / http://127.0.0.1:<port>   # 方式 B の例
```

- `tailscale serve reset` は使わない。serve 設定はノード全体で 1 つなので、片方のアプリの都合でリセットすると `/` と `/gh` も消える。追加・削除は `--set-path` 単位で行う
- `tailscale serve status` で両アプリの経路を確認できる

## 変えなくてよいもの

- VPS 事業者のセキュリティグループ: inbound は UDP 41641 のみのまま。入口は全部 Tailscale 経由
- ディレクトリ: `/srv/<app>` を並べる。`/srv/easy-road-nav` 配下には触らない
- compose: アプリごとに 1 ファイル。project 名はディレクトリ名から決まるので、`deploy-graph.sh` の `docker compose down` が別アプリを巻き込むことはない
- ポート: 別アプリも `127.0.0.1:<port>:<port>` でバインド。8989 は使用中
- デプロイ: `VPS_HOST` は同じ値を使える。rsync 先だけ `/srv/<app>` に変える
- OS 自動更新 + 04:00 再起動: 両アプリに適用される。別アプリの compose にも `restart: unless-stopped` を付ければ復帰する

## 別アプリ側に課される制約

- `tailscale serve` は gzip 圧縮・ヘッダ制御・SPA fallback をしない。history ルーティングの SPA はそのままでは動かない。hash ルーティングにするか、アプリの compose に Caddy / nginx を 1 つ置いて serve からそこへ転送する
- 「VPS に固有状態を持たせない。バックアップ不要」はこのアプリの方針で、VPS 全体の方針ではない。別アプリが DB を持つなら、そのアプリの責任でバックアップを設計する（VPS のディスクは 200 GB あるが、スナップショットは取っていない）
- Docker ログは既定の json-file で上限なし。長期稼働でログを吐くアプリなら compose の `logging.options.max-size` を付ける
