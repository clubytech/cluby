# Sourced, not run. Decides how the scripts in this directory sign, and sets $SIGNER — the flags to
# pass to `cast send` and `forge script` — plus $FROM, the address those flags resolve to.
#
# Why this file exists. Every script here used to pass `--private-key "$PRIVATE_KEY"`, which puts
# the raw key in argv: visible in `ps` to any process on the box for the life of the call, and
# recorded in the shell's history if the command was ever typed rather than run from a file. One of
# them even carried a comment saying "the key is read here and never crosses a shell prompt" — it
# does not cross a prompt, it crosses argv, which is worse, because argv is readable by everyone
# and a prompt is not.
#
# Preferred: a Foundry keystore. `cast` reads the account name and the password from the
# environment, so nothing about the key reaches the command line at all, and what is on disk is
# encrypted rather than a hex string in a dotfile.
#
#   ./scripts/import-key.sh cluby        # once, interactive
#   export ETH_KEYSTORE_ACCOUNT=cluby
#   export ETH_PASSWORD_FILE=~/.cluby-pass
#
# Fallback: PRIVATE_KEY from .env, the way it worked before. It still works, and it still says so
# out loud, because a warning that appears once a day is cheaper than a key that leaks once.

if [ -n "${ETH_KEYSTORE_ACCOUNT:-}" ]; then
  if [ -n "${ETH_PASSWORD_FILE:-}" ]; then
    [ -r "$ETH_PASSWORD_FILE" ] || { echo "ETH_PASSWORD_FILE is not readable: $ETH_PASSWORD_FILE" >&2; exit 1; }
    # Exported, not passed: --password-file would be in argv too, and while the path is not the
    # secret, keeping the whole shape out of argv is the point of the exercise.
    ETH_PASSWORD="$(cat "$ETH_PASSWORD_FILE")"
    export ETH_PASSWORD
  elif [ -z "${ETH_PASSWORD:-}" ]; then
    echo "ETH_KEYSTORE_ACCOUNT is set but no password: set ETH_PASSWORD_FILE or ETH_PASSWORD." >&2
    exit 1
  fi
  SIGNER=()
  FROM=$(cast wallet address)
elif [ -n "${PRIVATE_KEY:-}" ]; then
  echo "warning: signing with PRIVATE_KEY from the environment. The key crosses argv on every" >&2
  echo "         call and is readable in ps. Run ./scripts/import-key.sh to stop doing that." >&2
  SIGNER=(--private-key "$PRIVATE_KEY")
  FROM=$(cast wallet address --private-key "$PRIVATE_KEY")
else
  echo "No signer: set ETH_KEYSTORE_ACCOUNT (see ./scripts/import-key.sh) or PRIVATE_KEY in .env." >&2
  exit 1
fi

export FROM
