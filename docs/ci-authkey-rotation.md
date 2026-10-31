# CI ランナー用 auth key の差し替え（90 日ごと）

GitHub Actions のランナーは、Tailscale の auth key で tailnet に入って VPS へ配る。この tailnet は Tailnet Lock が有効なので、key は Mac で署名したものでないと VPS に届かない。auth key の期限は最長 90 日。切れると Deploy web / Deploy graph が `tailscale/github-action` のステップで落ちる。切れる前にこの手順で差し替える。初回のセットアップ（[runbook](runbook.md) 1 章 6）も同じ手順。

所要 5 分。管理画面 → Mac → GitHub の順に 3 か所を触る。workflow の変更は要らない。

## 期限の確認

Tailscale 管理画面 Settings > Keys に、今の key の失効日が出る。差し替えたら次の失効日をカレンダーに入れる。失効に気づく仕組みはこれだけで、Actions が落ちて初めて気づくのが既定の経路になる。

## 1. 管理画面で auth key を発行する

Tailscale 管理画面 Settings > Keys > Generate auth key。

- Reusable: ON（ランナーは実行ごとに新しいノードになる）
- Expiration: 90 days（最長）
- Ephemeral: ON（job 終了後にノードが消える）
- Pre-approved: ON（Device approval を使っていなければ項目が出ない。出ていれば ON）
- Tags: `tag:ci`

生成された `tskey-auth-...` を控える。この画面を閉じると二度と表示されない。

## 2. Mac で署名する

Mac は signing node（`tailscale lock status` の Trusted signing keys に `(self)` が出る）なので、そのまま署名できる。

```sh
TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
$TS lock sign tskey-auth-<手順 1 のキー>
```

出力される長いキーが署名済み auth key。手順 1 の元のキーは使わず、この出力を GitHub に渡す。

署名済みキーは GitHub 以外に残さない。登録したらターミナルの履歴からも消す（`history -d` か、キーをファイル経由で渡してからファイルを消す）。

## 3. GitHub の Environment secret を上書きする

リポジトリ Settings > Environments > `production` > Environment secrets の `TAILSCALE_AUTHKEY` を手順 2 の値で上書きする。

## 4. 確認

次に main へ push したときの Deploy web が緑なら完了。すぐ確かめたいときは Actions タブ > Deploy graph > Run workflow で main を手動実行する（30 分以上かかる）。

`tailscale/github-action` のステップで落ちたら、key の署名漏れ（手順 1 の元キーをそのまま登録）か、タグ違いをまず疑う。

## 古い key の後始末

管理画面 Settings > Keys で、失効済みの key は一覧から消してよい。ランナーは job 終了で消える ephemeral ノードなので、古い key で入ったノードが残ることはない。
