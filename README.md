# PEEKS

<p align="center">
  <strong>직장인들의 몰래보는 스포츠</strong><br/>
  <sub>회의 중에도, 탭만 잘 쌓아두면… 물론 업무에 집중하시는 거죠? 🙃</sub>
</p>

---

회사 PC 화면 구석에 **항상 위**에 떠 있는 스포츠 위젯입니다.  
NBA · MLB · 축구(EPL, 라리가, 분데스리가, 세리에 A, UCL)까지, **관심 팀 경기·스코어·순위**를 한곳에서 받아보세요.  
상사가 지나갈 땐 **슬쩍 투명하게**, 동료 옆에선 **그냥 흑백 창**처럼, 개발자 책상에선 **터미널 로그처럼** 보이게까지. 몰래보기는 기술이 아니라 **디테일**입니다. *(농담입니다. 적당히 쓰세요.)*

---

## ✨ 이런 게 됩니다

| | |
|--|--|
| 🏀⚾⚽ | **경기 & 스코어** — 오늘 내 팀 카드, **ALL GAMES**로 리그 전체 스코어보드 |
| 📊 | **순위** — NBA 동·서부, MLB 리그, 축구 리그별 테이블 |
| ⭐ | **즐겨찾기** — 팀 등록, 카드 **드래그로 순서 변경**, 로고 클릭으로 빠른 추가 |
| 🪟 | **창** — 크기·위치 기억, **Esc 두 번**으로 최소화(보스 키 느낌) |

### 🕵️ 몰래보기 4종 세트 *(설정 → 몰래보기 탭)*

1. **투명도** — 위젯 전체를 10%～100%로 조절 (로컬 저장).
2. **고스트 모드** — 평소엔 살짝 흐리게, **마우스를 올리면 선명**하게.
3. **모노크롬** — 위젯 전체 **흑백** 위장. *(The Coder Mode가 켜져 있으면 시각적으로는 코더 스타일이 우선합니다.)*
4. **The Coder Mode** — 로고·그라데이션 대신 **모노스페이스 + 다크 톤**. 스코어를 **터미널 로그** 스타일 또는 **`const match = { … }`** 코드 스타일 중 선택.

---

## 🛠 기술 스택 *(실제 `package.json` 기준)*

| 구분 | 사용 |
|------|------|
| **앱 셸** | [Electron](https://www.electronjs.org/) `^28` |
| **런타임 의존성** | [axios](https://axios-http.com/) (ESPN API JSON), [cheerio](https://cheerio.js.org/) *(의존성에 포함)* |
| **빌드** | [electron-builder](https://www.electron.build/) — macOS **universal** `.dmg` |
| **UI** | 바닐라 HTML / CSS / JS (`index.html`, `style.css`, `renderer.js`) + `preload` IPC |

> 이 레포에는 **Framer Motion**, **node-vibrant** 등은 없습니다. 리드미는 코드와 맞춰 두었습니다.

---

## 🚀 설치 & 실행

### 필요한 것

- **macOS** *(현재 빌드·타이틀바 설정이 맥 기준입니다.)*
- **Node.js** 18+ 권장

### 개발 실행

```bash
git clone https://github.com/kangbyuk/peeks.git
cd peeks
npm install
npm start
```

`npm start`는 내부적으로 `ELECTRON_RUN_AS_NODE`를 해제한 뒤 Electron을 띄웁니다.  
같은 방식으로 `npm run dev`도 사용할 수 있습니다.

### 맥 앱으로 패키징

```bash
npm run build
```

산출물은 보통 `dist/PEEKS-1.0.0-universal.dmg` 및 `dist/mac-universal/PEEKS.app` 입니다.  
코드 서명은 로컬 설정에 따라 생략될 수 있으며, 다른 Mac에서는 보안 경고 후 **열기**가 필요할 수 있습니다.

### GitHub에 올리기 (Cursor)

1. **Git 사용자 정보** (커밋에 표시됨 — 한 번만 설정)
   ```bash
   git config --global user.name "이름"
   git config --global user.email "깃허브이메일@example.com"
   ```
   이미 첫 커밋이 있다면 위 설정 후 `git commit --amend --reset-author --no-edit` 로 작성자만 고칠 수 있습니다.

2. **Cursor 확장**  
   왼쪽 **Extensions**에서 `GitHub Pull Requests` 검색 → **GitHub** (Microsoft) 설치.  
   또는 저장소를 열면 **추천 확장** 알림이 뜰 수 있습니다 (`.vscode/extensions.json`).

3. **원격 저장소에 푸시**
   - **방법 A**  
     GitHub 웹에서 **New repository**로 빈 레포 생성 (README 추가하지 않는 편이 충돌이 적습니다).  
     터미널에서:
     ```bash
     git remote add origin https://github.com/kangbyuk/peeks.git
     git push -u origin main
     ```
   - **방법 B (Cursor UI)**  
     왼쪽 **Source Control** → **Publish Branch** / **Publish to GitHub**가 보이면 클릭 후 브라우저에서 GitHub 로그인·레포 이름 선택.

4. **(선택) GitHub CLI** `gh`  
   [GitHub CLI 설치](https://cli.github.com/) 후 `gh auth login` → `gh repo create` 로 레포 생성·푸시도 가능합니다.

---

## 📁 구조 한눈에

```
main.js      # BrowserWindow, IPC, ESPN 요청, 창 상태 저장
preload.js   # renderer ↔ main 안전 브리지
renderer.js  # UI, 즐겨찾기, 몰래보기, 스코어 폴링
index.html   # 마크업
style.css    # 스타일 (고스트 / 코더 모드 등)
assets/      # 아이콘 등
```

---

## 🔮 잠깐, 비전

지금은 **PEEKS SPORTS**로 직장인의 **몰래 스코어**를 책임지고, 나중에는 같은 철학으로 **PEEK STOCK** 같은 확장도 열어 볼 생각입니다. *(아직 레포에 없고, 기대용 한 줄입니다.)*

---

## ⚠️ 면책

- 스포츠 데이터는 **ESPN 공개 API** 성격의 엔드포인트를 사용합니다. 제공사 정책·가용성은 바뀔 수 있습니다.
- **업무 시간 집중**은 여러분의 선택입니다. 이 README는 유머와 UX 소개용입니다.

---

<p align="center">
  <b>PEEKS</b> — 직장인들의 몰래보는 스포츠 🏀⚾⚽<br/>
  <i>Star 한 번이면, 다음 스프린트에 행운이… 있을지도.</i> ⭐
</p>
