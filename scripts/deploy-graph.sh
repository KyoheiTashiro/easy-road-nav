#!/bin/sh
# graph-cache + graphhopper/ を VPS へ転送し、VPS の入替スクリプトで serve を入れ替える（runbook 2 章）。
#   VPS_HOST=deploy@<host>.<tailnet>.ts.net npm run deploy:graph
# compose.yml は送らない。入替スクリプトが main から取る。
set -eu
VPS=${VPS_HOST:?set VPS_HOST (user@host)}
APP_DIRECTORY=/srv/easy-road-nav

rsync -az --delete data/graph-cache/ "$VPS:$APP_DIRECTORY/data/graph-cache.new/"
rsync -az --delete graphhopper/ "$VPS:$APP_DIRECTORY/graphhopper.new/"
# -n: パスワードを求められたら待たずに失敗させる
ssh "$VPS" sudo -n /usr/local/sbin/easy-road-nav-swap-graph
