#!/usr/bin/env bash
# Move a raw private key into an encrypted Foundry keystore, once, so the scripts here stop putting
# it in argv.
#
#   ./scripts/import-key.sh cluby
#
# It prompts for the key rather than taking it as an argument, on purpose: an argument would be in
# your shell history and in ps, which is the thing being fixed. Paste it at the prompt; it is not
# echoed.
set -euo pipefail

NAME="${1:-cluby}"
PASS_FILE="${2:-$HOME/.cluby-pass}"

command -v cast >/dev/null || { echo "foundry is not installed" >&2; exit 1; }

if [ -f "$HOME/.foundry/keystores/$NAME" ]; then
  echo "A keystore called '$NAME' already exists. Pick another name, or delete it first." >&2
  exit 1
fi

echo "Paste the private key (it will not be shown), then press Enter:"
read -rs KEY
echo

case "$KEY" in
  0x*) ;;
  *) KEY="0x$KEY" ;;
esac
[ ${#KEY} -eq 66 ] || { echo "that is not a 32-byte key" >&2; exit 1; }

if [ ! -f "$PASS_FILE" ]; then
  umask 077
  # A generated password, because the point is that the key is encrypted at rest, not that a human
  # remembers a passphrase. The file is the secret now, and it is 0600 in your home directory.
  head -c 32 /dev/urandom | base64 > "$PASS_FILE"
  echo "wrote a new keystore password to $PASS_FILE (0600)"
fi

cast wallet import "$NAME" --private-key "$KEY" --password-file "$PASS_FILE" >/dev/null
unset KEY

addr=$(ETH_KEYSTORE_ACCOUNT="$NAME" ETH_PASSWORD="$(cat "$PASS_FILE")" cast wallet address)
echo
echo "Imported $addr as '$NAME'."
echo
echo "Add these to your .env (and delete PRIVATE_KEY from it):"
echo "  ETH_KEYSTORE_ACCOUNT=$NAME"
echo "  ETH_PASSWORD_FILE=$PASS_FILE"
