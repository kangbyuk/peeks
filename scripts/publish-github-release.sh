#!/usr/bin/env bash
# GitHub Draft 릴리스 생성/갱신 + DMG/EXE 업로드 (gh CLI 필요)
set -euo pipefail

REPO="kangbyuk/peeks"
TAG="v1.2.0"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NOTES="$ROOT/scripts/release-notes-v1.2.0.md"
DMG="$ROOT/dist/PEEKS-1.2.0-universal.dmg"
EXE="$ROOT/dist/PEEKS-Setup-1.2.0.exe"

if ! command -v gh >/dev/null 2>&1; then
  echo "오류: gh(GitHub CLI)가 없습니다. 설치: brew install gh && gh auth login"
  exit 1
fi

for f in "$NOTES" "$DMG" "$EXE"; do
  if [[ ! -f "$f" ]]; then
    echo "오류: 파일이 없습니다 — $f"
    exit 1
  fi
done

if gh release view "$TAG" --repo "$REPO" &>/dev/null; then
  echo "기존 릴리스 $TAG 노트(초안) 갱신 중..."
  gh release edit "$TAG" --repo "$REPO" --notes-file "$NOTES" --draft
else
  echo "Draft 릴리스 $TAG 생성 중..."
  gh release create "$TAG" --repo "$REPO" --draft --title "v1.2.0: MLB Division Standings & UI Update" --notes-file "$NOTES"
fi

echo "에셋 업로드 중..."
gh release upload "$TAG" --repo "$REPO" --clobber "$DMG" "$EXE"

echo ""
echo "완료. Draft 릴리스 페이지:"
echo "https://github.com/$REPO/releases/tag/$TAG"
echo "(GitHub에서 Publish release로 공개하세요.)"
