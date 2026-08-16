#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${HOME}/.local/bin"
APPS_DIR="${HOME}/.local/share/applications"
ICONS_DIR="${HOME}/.local/share/icons/hicolor/scalable/apps"

mkdir -p "${BIN_DIR}" "${APPS_DIR}" "${ICONS_DIR}"

if [ ! -f "${PROJECT_DIR}/dist/bin/cimo" ]; then
  echo "Building Cimo first..."
  "${PROJECT_DIR}/packaging/build-linux.sh"
fi

echo "Installing Cimo to ${BIN_DIR}..."
cp "${PROJECT_DIR}/dist/bin/cimo" "${BIN_DIR}/cimo"
chmod +x "${BIN_DIR}/cimo"

echo "Installing desktop entry to ${APPS_DIR}..."
cp "${PROJECT_DIR}/packaging/cimo.desktop" "${APPS_DIR}/cimo.desktop"
sed -i "s|Exec=cimo|Exec=${BIN_DIR}/cimo|g" "${APPS_DIR}/cimo.desktop"

echo "Installing icon..."
cp "${PROJECT_DIR}/dist/share/icons/hicolor/scalable/apps/cimo.svg" "${ICONS_DIR}/cimo.svg"

if command -v update-desktop-database > /dev/null 2>&1; then
  update-desktop-database "${APPS_DIR}" || true
fi

echo "Cimo successfully installed!"
