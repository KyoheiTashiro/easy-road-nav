#!/bin/sh
# graph-cache + graphhopper/ + compose.yml を VPS へ転送し、serve を入れ替える（runbook 2 章）。
#   VPS_HOST=<user>@<host>.<tailnet>.ts.net npm run deploy:graph
# 停止は down〜up の間、数十秒。/info が返らなければ旧 graph-cache に戻して up する。
set -eu
VPS=${VPS_HOST:?set VPS_HOST (user@host)}
DIR=/srv/easy-road-nav

rsync -az --delete data/graph-cache/ "$VPS:$DIR/data/graph-cache.new/"
rsync -az --delete graphhopper/ "$VPS:$DIR/graphhopper/"
rsync -az compose.yml "$VPS:$DIR/"

ssh "$VPS" sh -s <<REMOTE
set -eu
cd $DIR
docker compose down
rm -rf data/graph-cache.old
[ ! -d data/graph-cache ] || mv data/graph-cache data/graph-cache.old
mv data/graph-cache.new data/graph-cache
docker compose up -d serve
for i in \$(seq 1 30); do
  sleep 2
  curl -sf localhost:8989/info >/dev/null && { echo "serve OK"; rm -rf data/graph-cache.old; exit 0; }
done
echo "serve NG: 旧 graph-cache に戻す" >&2
docker compose down
[ ! -d data/graph-cache.old ] || { rm -rf data/graph-cache; mv data/graph-cache.old data/graph-cache; }
docker compose up -d serve
exit 1
REMOTE
