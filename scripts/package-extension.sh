#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/dist"

VERSION="${1:-}"
if [[ -z "${VERSION}" ]]; then
  VERSION="$(python3 - <<'PY'
import json
from pathlib import Path
manifest = json.loads(Path("manifest.json").read_text(encoding="utf-8"))
print(manifest["version"])
PY
)"
fi

ARCHIVE_NAME="better-gallery-v${VERSION}.zip"
ARCHIVE_PATH="${OUT_DIR}/${ARCHIVE_NAME}"

mkdir -p "${OUT_DIR}"
rm -f "${ARCHIVE_PATH}"

cd "${ROOT_DIR}"

zip -rq "${ARCHIVE_PATH}" \
  manifest.json \
  content.js \
  providers.js \
  viewer.html \
  viewer.css \
  viewer.js \
  popup.html \
  popup.css \
  popup.js \
  options.html \
  options.css \
  options.js \
  _locales \
  icons

echo "Created ${ARCHIVE_PATH}"
