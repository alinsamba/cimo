#!/usr/bin/env bash
set -euo pipefail

echo "========================================="
echo "Building Cimo for Linux (x86_64)"
echo "========================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${PROJECT_DIR}/dist"

rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}/bin" "${DIST_DIR}/share/applications" "${DIST_DIR}/share/icons/hicolor/scalable/apps" "${DIST_DIR}/share/icons/hicolor/512x512/apps"

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

cp "${PROJECT_DIR}/cimo logo/cimo.svg" "${DIST_DIR}/share/icons/hicolor/scalable/apps/cimo.svg"
cp "${PROJECT_DIR}/cimo logo/cimo.png" "${DIST_DIR}/share/icons/hicolor/512x512/apps/cimo.png"

chmod +x "${DIST_DIR}/bin/cimo"

echo "========================================="
echo "Build complete! Binary located at: ${DIST_DIR}/bin/cimo"
echo "========================================="
