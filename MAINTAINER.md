# PEEKS 유지보수 노트 (비공개용)

일반 사용자용 README에는 넣지 않는 설정·분석·배포 메모입니다.

---

## GA4 Measurement Protocol

앱은 **gtag 없이** 메인 프로세스에서 [Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)로 이벤트를 전송합니다.

| 항목 | 값 |
|------|-----|
| 측정 ID (Measurement ID) | `G-M16NPNDWPG` |
| 구현 파일 | `ga4-mp.js` (axios), `main.js` IPC `ga4:track`, `preload.js` `analyticsAPI`, `renderer.js` 호출 |
| 시크릿 | **절대 Git에 커밋하지 말 것** (`.gitignore`에 `ga4-secret.local.json` 있음) |

### GA4 관리자에서 할 일

1. GA4 속성 → **관리** → **데이터 스트림** → 해당 스트림 선택  
2. **Measurement Protocol API secrets** → 새 시크릿 생성  
3. 생성된 **시크릿 값**만 로컬/빌드 환경에 설정 (아래 참고)

### 로컬 개발에서 전송 켜기

터미널:

```bash
export GA4_API_SECRET='여기에_발급한_시크릿'
npm start
```

시크릿이 없으면 콘솔에 한 번 경고가 나오고 전송은 생략됩니다.

### 로컬 JSON 파일로 시크릿 주기

1. `ga4-secret.local.json.example`을 복사해 `ga4-secret.local.json` 생성  
2. 내용 예시:

```json
{
  "api_secret": "여기에_시크릿_붙여넣기"
}
```

3. `ga4-mp.js`는 `process.env.GA4_API_SECRET`이 없을 때 같은 폴더의 `ga4-secret.local.json`을 읽습니다.

### DMG에 시크릿을 넣어 배포하는 경우

1. 위 JSON 파일을 프로젝트 루트에 둠 (git 추적 안 됨)  
2. `package.json`의 `build.files` 배열에 **`"ga4-secret.local.json"`** 한 줄 추가  
3. `npm run build`  
4. **주의:** DMG 안에 시크릿이 포함되므로 유출 위험이 있습니다. 내부/테스트용으로만 권장합니다.

### 수집 이벤트 (커스텀)

| 이벤트명 | 시점 | 주요 파라미터 |
|----------|------|----------------|
| `app_start` | 렌더러 초기화 직후 | `app_version` 등 |
| `add_team` | 팀 관리 저장, ALL GAMES/순위에서 즐겨찾기 추가 | `team_name`, `sport`, `league_id` |
| `change_mode` | 몰래보기: 고스트/모노/코더/투명도(슬라이더 놓을 때)/코더 출력 형식 | `mode`, `enabled` 또는 `value_percent`, `format` |

### 실시간에서 확인

1. [Google Analytics](https://analytics.google.com/) → 해당 GA4 속성  
2. **보고서 → 실시간**  
3. 시크릿이 설정된 상태로 앱 실행 후 수십 초 이내에 `app_start` 등이 집계되는지 확인  

전송이 안 되면:

- `GA4_API_SECRET` 또는 `ga4-secret.local.json` 존재 여부  
- 메인 프로세스 로그의 `[ga4]` 경고  
- 스트림 ID와 시크릿이 같은 속성인지

### 디버그 엔드포인트 (선택)

검증만 할 때는 `ga4-mp.js`의 URL을 임시로  
`https://www.google-analytics.com/debug/mp/collect` 로 바꿔 응답 본문을 확인할 수 있습니다. 운영 전 원래 collect URL로 되돌리세요.
