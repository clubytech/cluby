#!/usr/bin/env bash
# Called by cluby-alert@.service when a unit enters the failed state.
#
# systemd will restart a crashing service, but only until it hits the start limit — after that the
# unit sits in `failed` until somebody runs `systemctl reset-failed`, and nothing anywhere says so.
# For a keeper whose entire job is to be running when a position goes underwater, that silence is
# the failure mode that matters. This is the thing that breaks it.
set -u
unit="${1:-unknown}"

status=$(systemctl is-active "$unit" 2>&1)
recent=$(journalctl -u "$unit" -n 15 --no-pager -o cat 2>&1 | tail -c 1500)

read -r -d '' text <<TXT || true
$unit is $status on $(hostname).

systemd has stopped trying to restart it. It will not come back without
  systemctl reset-failed $unit && systemctl start $unit

Last lines:
$recent
TXT

if [ -n "${TELEGRAM_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT:-}" ]; then
  curl -sS -m 20 -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
    -H 'content-type: application/json' \
    --data-binary @<(jq -Rn --arg c "$TELEGRAM_CHAT" --arg t "$text" \
      '{chat_id: $c, text: $t, disable_web_page_preview: true}') >/dev/null
fi
echo "$text"
