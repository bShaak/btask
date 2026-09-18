#!/bin/sh
# Install the btask agent integration for the current user:
#   1. Symlink contract/btask-contract.md -> ~/.agents/btask-contract.md
#   2. Symlink opencode/btask-enforce.ts -> ~/.config/opencode/plugins/btask-enforce.ts
#   3. Register the contract in ~/.config/opencode/opencode.jsonc instructions
#
# Safe to re-run: symlinks are refreshed, existing instructions entries are kept.
# Regular files already at either target are backed up, never overwritten.
set -u

REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CONTRACT_SRC="$REPO_DIR/contract/btask-contract.md"
PLUGIN_SRC="$REPO_DIR/opencode/btask-enforce.ts"
CONTRACT_DST="$HOME/.agents/btask-contract.md"
PLUGIN_DST_DIR="$HOME/.config/opencode/plugins"
PLUGIN_DST="$PLUGIN_DST_DIR/btask-enforce.ts"
CONFIG="$HOME/.config/opencode/opencode.jsonc"

fail() { echo "install-agent-integration: $*" >&2; exit 1; }
[ -f "$CONTRACT_SRC" ] || fail "missing $CONTRACT_SRC (run from a btask checkout)"
[ -f "$PLUGIN_SRC" ] || fail "missing $PLUGIN_SRC (run from a btask checkout)"

link_file() {
  src=$1 dst=$2
  mkdir -p "$(dirname -- "$dst")"
  if [ -L "$dst" ]; then
    rm -- "$dst"
  elif [ -e "$dst" ]; then
    backup="${dst}.bak.$(date +%Y%m%d%H%M%S)"
    mv -- "$dst" "$backup"
    echo "backed up existing $dst -> $backup"
  fi
  ln -s -- "$src" "$dst"
  echo "linked $dst -> $src"
}

link_file "$CONTRACT_SRC" "$CONTRACT_DST"
link_file "$PLUGIN_SRC" "$PLUGIN_DST"

mkdir -p "$(dirname -- "$CONFIG")"
if [ ! -e "$CONFIG" ]; then
  cat >"$CONFIG" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "instructions": ["$CONTRACT_DST"]
}
EOF
  echo "created $CONFIG"
elif grep -qF "$CONTRACT_DST" "$CONFIG"; then
  echo "contract already registered in $CONFIG"
elif command -v bun >/dev/null 2>&1 && bun -e 'JSON.parse(await Bun.file(Bun.argv[1]).text())' "$CONFIG" >/dev/null 2>&1; then
  backup="${CONFIG}.bak.$(date +%Y%m%d%H%M%S)"
  cp -- "$CONFIG" "$backup"
  bun -e '
    const path = Bun.argv[1], entry = Bun.argv[2];
    const raw = await Bun.file(path).text();
    const cfg = JSON.parse(raw);
    const list = Array.isArray(cfg.instructions) ? cfg.instructions : [];
    if (!list.includes(entry)) list.push(entry);
    cfg.instructions = list;
    await Bun.write(path, JSON.stringify(cfg, null, 2) + "\n");
  ' "$CONFIG" "$CONTRACT_DST"
  echo "registered contract in $CONFIG (backup: $backup)"
else
  echo "could not merge $CONFIG automatically (not plain JSON?)." >&2
  echo "Add this entry manually and restart OpenCode:" >&2
  echo "  \"instructions\": [\"$CONTRACT_DST\"]" >&2
fi

echo "done. Restart OpenCode to pick up the plugin and instructions."
