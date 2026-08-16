#!/usr/bin/env bash
set -euo pipefail

echo "========================================="
echo "Building Cimo for Linux (x86_64)"
echo "========================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${PROJECT_DIR}/dist"

rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}/bin" "${DIST_DIR}/share/applications" "${DIST_DIR}/share/icons/hicolor/scalable/apps"

echo "[1/3] Bundling client UI assets..."
bun build "${PROJECT_DIR}/src/ui/app.ts" \
  --outdir "${PROJECT_DIR}/src/ui" \
  --target browser \
  --minify

echo "[2/3] Compiling standalone executable..."
bun build "${PROJECT_DIR}/src/index.ts" \
  --compile \
  --outfile "${DIST_DIR}/bin/cimo" \
  --minify

echo "[3/3] Packaging desktop files and assets..."
cp "${PROJECT_DIR}/packaging/cimo.desktop" "${DIST_DIR}/share/applications/cimo.desktop"

# Create SVG Icon
cat << 'EOF' > "${DIST_DIR}/share/icons/hicolor/scalable/apps/cimo.svg"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="cimoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#a855f7" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="#0a0a0c" />
  <rect x="6" y="6" width="116" height="116" rx="22" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2" />
  <polygon points="46,36 94,64 46,92" fill="url(#cimoGrad)" />
</svg>
EOF

chmod +x "${DIST_DIR}/bin/cimo"

echo "========================================="
echo "Build complete! Binary located at: ${DIST_DIR}/bin/cimo"
echo "========================================="
