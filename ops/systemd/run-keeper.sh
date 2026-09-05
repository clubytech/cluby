#!/usr/bin/env bash
# What `cluby-keeper.service` execs.
#
# A launcher rather than an ExecStart= one-liner, because the unit file's escaping rules ate the
# command the first time this was set up. It also keeps the keeper's key out of the unit and out of
# `ps`: the key is read from the env file systemd hands us, never interpolated into an argument.
set -euo pipefail
cd /opt/cluby/apps/keeper
exec /usr/bin/env node --experimental-strip-types --no-warnings src/index.ts
