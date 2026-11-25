#!/bin/sh
# This mutates only disposable GitHub-hosted runners; never run on a user's VPS.
set -eu
[ "${GITHUB_ACTIONS:-}" = true ] && [ "${BLACKWHITE_TEST_SYSTEMD:-}" = 1 ] && [ "$(id -u)" -eq 0 ] || { echo 'Requires a disposable GitHub Actions systemd runner.' >&2; exit 1; }
[ ! -e /fixture ] || { echo '/fixture already exists; refusing to replace it.' >&2; exit 1; }
ln -s "$BLACKWHITE_FIXTURE_ROOT" /fixture
mkdir -p /tmp/blackwhite-fixture-bin
cat > /tmp/blackwhite-fixture-bin/curl <<'SH'
#!/bin/sh
asset=''
output=''
while [ "$#" -gt 0 ]; do
  case "$1" in -o) output=$2; shift 2 ;; https://github.com/imperatorwuming/komari-theme-blackwhite/releases/latest/download/*) asset=${1##*/}; shift ;; *) shift ;; esac
done
case "$asset" in Blackwhite-Network-Observatory-latest.zip|Blackwhite-Network-Observatory-latest.zip.sha256) cp "/fixture/$asset" "$output" ;; *) exit 1 ;; esac
SH
chmod 0755 /tmp/blackwhite-fixture-bin/curl
export PATH="/tmp/blackwhite-fixture-bin:$PATH"
cleanup() {
  systemctl disable --now blackwhite-network-observatory-update.timer >/dev/null 2>&1 || true
  systemctl stop blackwhite-network-observatory-agent.service "blackwhite-network-observatory-probe@9c9c6478-879e-40e4-8648-c71828337491.service" >/dev/null 2>&1 || true
  rm /fixture
}
trap cleanup EXIT
sh /fixture/network-observatory/runner/quick-install.sh --profile lite
python3 /fixture/scripts/alpine-runner-fixture.py
