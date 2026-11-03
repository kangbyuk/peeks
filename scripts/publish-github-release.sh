#!/usr/bin/env bash
# GitHub 릴리스 생성/갱신 + DMG/EXE 업로드 (gh CLI 필요)
# 버전은 package.json에서 읽음. 노트: scripts/release-notes-v<버전>.md
# 사용: npm run release:publish -- "릴리스 제목(선택)"
set -euo pipefail

REPO="kangbyuk/peeks"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"
TITLE="${1:-PEEKS $TAG}"

NOTES="$ROOT/scripts/release-notes-$TAG.md"
DMG="$ROOT/dist/PEEKS-$VERSION-universal.dmg"
EXE="$ROOT/dist/PEEKS-Setup-$VERSION.exe"

if ! command -v gh >/dev/null 2>&1; then
  echo "오류: gh(GitHub CLI)가 없습니다. 설치: brew install gh && gh auth login"
  exit 1
fi

for f in "$NOTES" "$DMG" "$EXE"; do
  if [[ ! -f "$f" ]]; then
    echo "오류: 파일이 없습니다 — $f (npm run build 후 다시 실행)"
    exit 1
  fi
done

if gh release view "$TAG" --repo "$REPO" &>/dev/null; then
  echo "기존 릴리스 $TAG 노트 갱신 중..."
  gh release edit "$TAG" --repo "$REPO" --title "$TITLE" --notes-file "$NOTES"
else
  echo "릴리스 $TAG 생성 중..."
  gh release create "$TAG" --repo "$REPO" --target main --latest --title "$TITLE" --notes-file "$NOTES"
fi

echo "에셋 업로드 중..."
gh release upload "$TAG" --repo "$REPO" --clobber "$DMG" "$EXE"

echo ""
echo "완료. 릴리스 페이지:"
echo "https://github.com/$REPO/releases/tag/$TAG"
