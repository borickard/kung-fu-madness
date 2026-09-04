#!/usr/bin/env bash
# Copy the engine into supabase/functions so the edge runtime can load it.
#
# The functions import `engine`, which lives outside supabase/. Whether the
# CLI's edge-runtime container can see a path outside the functions directory
# depends on how it mounts the project, so we do not depend on it: this places
# a generated copy inside, and the import map points at that.
#
# The copy is gitignored, never edited by hand, and rewritten on every serve
# and deploy. packages/engine/src stays the only source.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/packages/engine/src"
dest="$root/supabase/functions/_shared/engine"

rm -rf "$dest"
mkdir -p "$dest"
cp "$src"/*.ts "$dest/"
cat > "$dest/GENERATED" <<'NOTE'
Copied from packages/engine/src by scripts/sync-engine.sh. Do not edit.
NOTE

echo "engine synced → supabase/functions/_shared/engine"
