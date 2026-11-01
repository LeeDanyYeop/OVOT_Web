# 웹 배포 (현재: 화면만 · DEMO 샘플 데이터)

`deploy-demo/` 폴더가 그대로 올릴 수 있는 완성본입니다 (빌드 결과 + DEMO 설정).

## Netlify 로 올리기 (설치 없음)
1. https://app.netlify.com/drop 접속 → 가입/로그인 (GitHub·이메일)
2. `admin-console\deploy-demo` **폴더째** 화면에 끌어다 놓기
3. 몇 초 뒤 `https://임의이름.netlify.app` 주소가 생김 → Site settings 에서 이름 변경 가능
4. 고친 뒤 다시 올릴 때: 사이트 → Deploys → 새 `deploy-demo` 폴더를 끌어다 놓기

## 나중에 서버·DB 연결할 때
- FastAPI 서버를 **HTTPS 주소**로 공개해야 합니다 (https 사이트는 http://localhost 나 http 서버를 부를 수 없음).
- `deploy-demo/ovot-config.json` 에서 `"mode": "live"`, `"apiBaseUrl": "https://서버주소"` 로 바꾸고 다시 올리면 됩니다 (다시 빌드할 필요 없음).
- 서버 `.env` 의 `CORS_ORIGINS` 에 `https://○○.netlify.app` 추가.
- **먼저 로그인/접근 제한**을 만드세요. 지금 관리자 화면은 로그인이 없어서, 실제 서버에 연결된 채 공개하면 주소를 아는 누구나 작업 상태·확인 처리를 바꿀 수 있습니다.
- DB 비밀번호는 웹(ovot-config.json 포함) 어디에도 넣지 않습니다. 서버 `.env` 에만.

## 다시 만들기 (코드를 고친 뒤)
```powershell
npm run build
```
→ `dist/` 를 `deploy-demo/` 로 복사하고 `deploy-demo/ovot-config.json` 의 mode 만 demo 로 유지.
