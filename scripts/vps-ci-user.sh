#!/bin/sh
# CI 用の deploy ユーザーと入替スクリプト（web・graph）を置く。
# deploy に許すのは web.new/ data/ graphhopper.new/ への書き込みと、2 つの入替スクリプトの引数なし sudo 実行だけ。
# VPS 上で sudo できるユーザーが実行。同じディレクトリに swap-web.sh と swap-graph.sh が要る。再実行は安全。
set -eu
cd "$(dirname "$0")"
APP_DIRECTORY=/srv/easy-road-nav

echo "== deploy ユーザー（sudo の一般権限なし・docker グループなし）"
id deploy >/dev/null 2>&1 || sudo useradd -m -s /bin/bash deploy

# APP_DIRECTORY 自体・compose.yml・graphhopper/・web/ は root 所有。
# graphhopper/ は入替スクリプトが root で compose に渡し、web/ は root の tailscale serve が配信するため。
echo "== $APP_DIRECTORY の所有者"
sudo mkdir -p $APP_DIRECTORY/web $APP_DIRECTORY/web.new $APP_DIRECTORY/data $APP_DIRECTORY/graphhopper $APP_DIRECTORY/graphhopper.new
sudo chown root:root $APP_DIRECTORY
[ ! -f $APP_DIRECTORY/compose.yml ] || sudo chown root:root $APP_DIRECTORY/compose.yml
sudo chown -R root:root $APP_DIRECTORY/graphhopper $APP_DIRECTORY/web
sudo chown -R deploy:deploy $APP_DIRECTORY/web.new $APP_DIRECTORY/data $APP_DIRECTORY/graphhopper.new

echo "== 入替スクリプトと sudoers"
# graph の入替スクリプトが main のコミットを git ls-remote で引く
command -v git >/dev/null || sudo apt-get install -y -q git
sudo install -o root -g root -m 755 swap-web.sh /usr/local/sbin/easy-road-nav-swap-web
sudo install -o root -g root -m 755 swap-graph.sh /usr/local/sbin/easy-road-nav-swap-graph
sudoers_file=$(mktemp)
# 末尾の "" は引数なしでの実行だけを許す指定
cat > "$sudoers_file" <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/local/sbin/easy-road-nav-swap-web ""
deploy ALL=(root) NOPASSWD: /usr/local/sbin/easy-road-nav-swap-graph ""
EOF
sudo visudo -cf "$sudoers_file"
sudo install -o root -g root -m 440 "$sudoers_file" /etc/sudoers.d/easy-road-nav-swap
sudo rm -f /etc/sudoers.d/easy-road-nav-swap-graph
rm -f "$sudoers_file"

echo "== 確認（sudo は入替スクリプトの 2 行だけ。web.new data graphhopper.new が deploy、他は root）"
sudo -l -U deploy | tail -2
ls -ld $APP_DIRECTORY $APP_DIRECTORY/*
