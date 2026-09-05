# Units

`cluby-keeper` and `cluby-indexer` run under systemd on the VPS as the `cluby` user, reading
`/opt/cluby/.env`. Both are managed by `install.sh` in this directory.

## Why the restart policy looks the way it does

The defaults were `RestartSec=10`, `StartLimitBurst=5`, `StartLimitIntervalSec=300`: fifty seconds
of a crash on startup and systemd gives up permanently. The unit sits in `failed` until somebody
runs `systemctl reset-failed`, and nothing tells anybody — no `OnFailure=`, no heartbeat. For a
keeper whose whole job is to be running at the moment a position goes underwater, that is the
failure that matters, and it is the one the config made silent.

An hour-long window with a burst of twenty tolerates a flapping RPC endpoint, which is the common
cause here and is transient. A hard crash loop still stops rather than spinning a core forever — but
now `OnFailure=cluby-alert@%n.service` fires when it does, with the last fifteen journal lines and
the exact command to bring it back.

The backoff climbs from 10 s toward 2 minutes over five restarts, so a service failing because a
node is down is not hammering that node on the way.
