#!/bin/sh
# VPS 初期構築（runbook 1 章 2〜10）。VPS 上で一般ユーザー（Ubuntu イメージ既定は ubuntu）で 1 回だけ実行。
#   curl -fsSL <raw url> | sh   または  scp して  sh vps-setup.sh
# 前提: VPS 事業者のセットアップ「Docker CE」で作成済み（docker + compose plugin 導入済み）。
# 再実行は安全（各手順は済んでいれば飛ばす）。
set -eu

# 2 GB メモリでは GraphHopper 起動時に足りないことがあるので swap を足す。
# /swapfile があれば作成済みとみなす。fstab 追記で再起動後も有効。
echo "== swap 2 GB"
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# deploy-graph.sh が sudo なしで docker compose を叩けるよう、実行ユーザーを docker グループに入れる。
# docker 自体は VPS 事業者のセットアップで導入済み前提。無ければ中断。
echo "== docker group"
command -v docker >/dev/null || { echo "docker なし。VPS 事業者のセットアップ Docker CE で作り直すか runbook 1-4 を手で入れる" >&2; exit 1; }
sudo usermod -aG docker "$USER"

# Tailscale の MagicDNS 名は hostname から決まる（easy-road-nav.<tailnet>.ts.net）。
echo "== hostname（FQDN の先頭になる）"
sudo hostnamectl set-hostname easy-road-nav

# Tailscale 導入 → tailnet 参加（--ssh で Tailscale SSH 有効。以後 TCP 22 を閉じられる）。
# up で認証 URL が出るのでブラウザで開く。--auto-update でクライアントを自動更新。
echo "== tailscale"
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
sudo tailscale up --ssh
sudo tailscale set --auto-update

# セキュリティ更新を自動適用し、再起動が必要なら JST 04:00 に再起動する。
# Reboot-Time はシステムのタイムゾーン基準なので先に JST にする。
echo "== unattended-upgrades（04:00 JST 自動再起動）"
sudo timedatectl set-timezone Asia/Tokyo
sudo apt-get install -y -q unattended-upgrades
sudo tee /etc/apt/apt.conf.d/52-autoreboot >/dev/null <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
EOF
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

# デプロイ先ディレクトリ。web/ = rsync 先の静的ファイル、data/ = graph-cache（compose が mount）。
# rsync が sudo なしで書けるよう実行ユーザー所有にする。
echo "== /srv/easy-road-nav"
sudo mkdir -p /srv/easy-road-nav/web /srv/easy-road-nav/data
sudo chown -R "$USER" /srv/easy-road-nav

# tailnet 内に HTTPS で公開。/ は web/ を静的配信、/gh は GraphHopper（127.0.0.1:8989）へリバースプロキシ。
# 設定は tailscaled が永続化するので再起動後も残る。
echo "== tailscale serve"
sudo tailscale serve --bg --set-path / /srv/easy-road-nav/web
sudo tailscale serve --bg --set-path /gh http://127.0.0.1:8989

# 完了表示。tailscale status の DNSName から FQDN を取り出して次の手順を案内。
echo
echo "完了。FQDN:"
tailscale status --json | sed -n 's/.*"DNSName": *"\([^"]*\)\.".*/  https:\/\/\1\//p' | head -1
