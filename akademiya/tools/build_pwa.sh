#!/usr/bin/env bash
# Akademiyanın quraşdırıla bilən (PWA) versiyasını toplayır.
#   bash akademiya/tools/build_pwa.sh _site/akademiya
# index.html Artifact formatındadır (doctype/head yoxdur); burada pwa/head.html ilə tam sənədə çevrilir.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:?çıxış qovluğu lazımdır}"
mkdir -p "$OUT"
cp -r "$SRC/lms.css" "$SRC/lms.js" "$SRC/sw.js" "$SRC/manifest.webmanifest" "$SRC/icons" "$SRC/courses" "$OUT/"
{ cat "$SRC/pwa/head.html" "$SRC/index.html"; printf '</body>\n</html>\n'; } > "$OUT/index.html"
BUILD="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || date +%s)"
sed -i "s/__BUILD__/$BUILD/" "$OUT/sw.js"
echo "Akademiya PWA: $OUT (build $BUILD)"
