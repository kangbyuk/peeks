# PEEKS 앱 아이콘 (사용자 에셋)

이 폴더는 **레포에 아이콘을 넣어두는 위치**입니다.  
Electron Builder의 `buildResources`는 **`electron-resources/`** 를 쓰므로, 여기가 비어 있어도 빌드는 됩니다.

커스텀 아이콘을 쓰려면 이 폴더에 파일을 넣고 `package.json`의 `build.mac.icon` / `build.win.icon`을 아래처럼 지정하세요.

| 파일 | 용도 |
|------|------|
| `icon.icns` | macOS (`.app` / DMG) |
| `icon.ico` | Windows (NSIS 설치 프로그램) |

**권장 크기**

- `.icns`: 512×512 이상 소스에서 `iconutil` 등으로 생성
- `.ico`: 256×256 포함 멀티 사이즈

아이콘을 넣은 뒤 `package.json` 예시:

```json
"mac": {
  "icon": "build/icons/icon.icns",
  ...
},
"win": {
  "icon": "build/icons/icon.ico",
  ...
}
```

지정한 파일이 없으면 빌드가 실패할 수 있으므로, 넣기 전에는 `package.json`에서 `icon` 항목을 비워 두거나 생략하세요 (Electron 기본 아이콘 사용).
