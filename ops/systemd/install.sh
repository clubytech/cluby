#!/usr/bin/env bash
# Install or update the Cluby systemd units. Run as root on the VPS.
set -euo pipefail
cd "$(dirname "$0")"

# Both live in the repo so a `rsync --delete` of the working tree cannot take them out from under
# the units — which is exactly what happened once.
install -m 755 alert-unit.sh /opt/cluby/alert-unit.sh
install -m 755 run-keeper.sh /opt/cluby/run-keeper.sh
install -m 644 cluby-alert@.service /etc/systemd/system/cluby-alert@.service

for unit in cluby-keeper cluby-indexer; do
  f=/etc/systemd/system/$unit.service
  [ -f "$f" ] || { echo "no $f — nothing to patch"; continue; }

  # Tolerate a flapping RPC (the common, transient cause); still stop a hard crash loop, but say so.
  sed -i \
    -e 's/^StartLimitIntervalSec=.*/StartLimitIntervalSec=3600/' \
    -e 's/^StartLimitBurst=.*/StartLimitBurst=20/' \
    -e 's/^RestartSec=.*/RestartSec=10/' \
    "$f"

  grep -q '^OnFailure=' "$f" || sed -i "/^\[Unit\]/a OnFailure=cluby-alert@%n.service" "$f"
  grep -q '^RestartSteps=' "$f" || sed -i '/^Restart=always/a RestartSteps=5\nRestartMaxDelaySec=120' "$f"
  echo "patched $unit"
done

systemctl daemon-reload
systemctl restart cluby-keeper cluby-indexer
systemctl --no-pager --lines=0 status cluby-keeper cluby-indexer || true
