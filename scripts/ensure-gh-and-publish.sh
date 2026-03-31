#!/usr/bin/env bash
# 사용자 맥 로컬 터미널에서 실행: brew로 gh 설치 → 인증 확인 → release:publish
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v brew >/dev/null 2>&1; then
  echo "오류: Homebrew를 찾을 수 없습니다. https://brew.sh 에서 설치 후 다시 실행하세요."
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI 설치 중 (brew install gh)..."
  brew install gh
fi

echo "GitHub CLI 인증 상태 확인 중..."
if ! gh auth status 2>&1; then
  echo ""
  echo "로그인이 필요합니다. 아래 명령을 실행한 뒤 이 스크립트를 다시 실행하세요:"
  echo "  gh auth login"
  exit 1
fi

echo "릴리즈 업로드 실행 (npm run release:publish)..."
npm run release:publish

echo ""
echo "완료. 릴리즈 페이지:"
echo "https://github.com/kangbyuk/peeks/releases/tag/v1.2.0"
