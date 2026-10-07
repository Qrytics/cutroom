#!/usr/bin/env bash
# Cutroom one-line installer — for you or a teammate.
#   curl -fsSL https://raw.githubusercontent.com/Qrytics/cutroom/main/scripts/install.sh | bash
#   curl -fsSL …/install.sh | bash -s -- --join "https://<team-server>/join/<code>"   (use a teammate's shared server)
# Installs into $CUTROOM_DIR (default ~/cutroom), then runs `npm run setup` with the same arguments:
# the cutroom MCP server + video-editor skill for Claude Code (and ffmpeg/Chromium when you host it yourself).
set -euo pipefail

DIR="${CUTROOM_DIR:-$HOME/cutroom}"
REPO="${CUTROOM_REPO:-https://github.com/Qrytics/cutroom.git}"
say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

command -v git >/dev/null || die "git is required (macOS: xcode-select --install)"
command -v node >/dev/null || die "Node.js 20+ is required — install it from https://nodejs.org (or: brew install node)"
major=$(node -p 'process.versions.node.split(".")[0]')
[ "$major" -ge 20 ] || die "Node.js 20+ is required (you have $(node -v)) — update from https://nodejs.org"
command -v claude >/dev/null || say "Note: Claude Code isn't installed yet (https://claude.com/claude-code) — Cutroom will connect to it once it is; re-run this command then."

if [ -d "$DIR/.git" ]; then
  say "Updating Cutroom in $DIR…"
  git -C "$DIR" pull --ff-only --quiet
else
  [ -e "$DIR" ] && die "$DIR exists and isn't a Cutroom checkout — set CUTROOM_DIR to another folder"
  say "Downloading Cutroom into $DIR…"
  git clone --quiet --depth 1 "$REPO" "$DIR"
fi

cd "$DIR"
say "Installing dependencies (a minute or two the first time)…"
npm install --no-fund --no-audit --loglevel=error
node scripts/setup.mjs "$@"
