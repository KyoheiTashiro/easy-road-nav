#!/bin/sh
# dist/ を VPS へ転送し、VPS の入替スクリプトで web/ を入れ替える（runbook 2 章）。
#   VPS_HOST=deploy@<host>.<tailnet>.ts.net npm run deploy
set -eu
VPS=${VPS_HOST:?set VPS_HOST (user@host)}
APP_DIRECTORY=/srv/easy-road-nav

rsync -az --delete dist/ "$VPS:$APP_DIRECTORY/web.new/"
# -n: パスワードを求められたら待たずに失敗させる
ssh "$VPS" sudo -n /usr/local/sbin/easy-road-nav-swap-web
