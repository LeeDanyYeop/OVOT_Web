# OVOT — 조선소 현장 작업자 앱 (웹 · PWA)

OVOT(One Voice, One Team)는 조선소 현장 작업자를 위한 웹 앱입니다.
작업자는 휴대폰 하나로 **출근 → 인수인계 확인 → 구역 등록 · 음성 스트리밍 → 오봇에게 질문 → 퇴근 정리**까지 하고,
관리자는 누가 어느 구역에 있는지, 현장 음성과 질문을 실시간으로 봅니다.

```
출근하기 → 인수인계(어제 작업 · 공정 단계 · 시작 전 확인) → 인수인계 확인
→ 배정 구역 등록 + 음성 스트리밍 시작 → 구역을 옮기면 NFC 태그 / QR
→ 작업 중 "오봇에게 물어보기" → 퇴근하기 → 오늘 한 일 · 다음 할 일 정리
```

> 구역 등록은 **작업구역 진입·이동 시점 기록**입니다. GPS 같은 연속 위치추적이 아닙니다.

배포 주소: **https://ovot.onrender.com** (작업자 `/`, 관리자 `/admin`)

## 빠르게 실행하기

요구사항: **Python 3.11 이상**, **Node.js 20 이상** (둘 다 PATH에 있어야 합니다).

```powershell
# 이 폴더(README.md가 있는 곳)에서, Windows PowerShell
powershell -ExecutionPolicy Bypass -File scripts/start.ps1        # 설치 + 빌드 + 서버 → http://localhost:8100
powershell -ExecutionPolicy Bypass -File scripts/test.ps1         # 자동 시험
powershell -ExecutionPolicy Bypass -File scripts/reset-demo.ps1   # 시연 데이터 초기화
```

직접 실행할 때:

```bash
cd frontend && npm ci && npm run build      # 화면 빌드 (서버가 dist를 같이 서빙)
cd ../backend && pip install -r requirements.txt && python run.py
```

- 처음 실행하면 `backend/data/`에 DB가 만들어지고 **시연 데이터(작업자 4명, 구역 4곳, 태그)가 자동으로 들어갑니다.**
- 브라우저에서 http://localhost:8100 (작업자), http://localhost:8100/admin (관리자)
- 개발 모드(수정 즉시 반영): 서버를 띄운 상태에서 `cd frontend && npm run dev` → http://localhost:5173

### AI 기능 켜기 (선택)

`backend/.env.example`을 `backend/.env`로 복사하고 Gemini API 키를 넣습니다.

```
GEMINI_API_KEY=발급받은_키
```

키는 [Google AI Studio](https://aistudio.google.com/apikey)에서 발급합니다.
키가 없어도 앱은 모두 동작하고, **오봇 음성 질문**은 안내 문구로, **퇴근 정리**는 기본 문장으로 나옵니다.

## 폴더 구성

```
ovot-web/
├─ backend/                     FastAPI + SQLAlchemy + SQLite
│  ├─ app/
│  │  ├─ main.py                앱, 라우터, 빌드된 화면 서빙
│  │  ├─ models.py              작업자, 구역, 태그, 위치 사건, 음성 클립, 오봇 질문 기록 …
│  │  ├─ guides.py              작업 지침·공정 단계·인수인계 기록 (시연 데이터)
│  │  ├─ seed.py                시연 데이터 (작업자·구역·태그·배정 작업)
│  │  ├─ routers/               auth, location, voice, assist(오봇), workday(출근·퇴근), admin, ws
│  │  └─ services/
│  │     ├─ location.py         구역 등록 처리 (중복 방지, 사건 추가, 현재 위치 갱신)
│  │     ├─ tag_verifier.py     태그 검증 (보안 태그로 교체 가능한 구조)
│  │     ├─ assist_ai.py        Gemini 호출 (재시도 포함)
│  │     ├─ workday.py          출근 인수인계 · 퇴근 정리
│  │     └─ event_hub.py        관리자 실시간 전송 (WebSocket)
│  ├─ tests/                    API·흐름 테스트 (pytest)
│  ├─ .env.example              AI 키 설정 예시
│  └─ run.py                    서버 실행 (기본 포트 8100, OVOT_PORT로 변경)
├─ frontend/                    React + TypeScript + Vite (PWA)
│  ├─ public/                   아이콘, 작업자 사진(avatars/), 지침 그림(guides/), sw.js
│  └─ src/
│     ├─ pages/                 Worker(작업자), Admin(관리자), Tags(태그·QR 관리)
│     ├─ components/            HandoverScreen(인수인계), BriefingScreen(퇴근 정리),
│     │                         AssistInline·AssistSheet(오봇 답변), SpeakingAvatar, QrScanSheet …
│     ├─ lib/                   api, useAssist, sky(시간대별 배경), workHours(근무 시간)
│     ├─ scan/                  Web NFC, QR
│     └─ capture/               음성 스트리밍(10초 클립), 질문 음성 캡처
├─ design/                      원본 디자인 파일
├─ scripts/                     start.ps1, test.ps1, reset-demo.ps1
└─ Dockerfile, render.yaml, docker-compose.yml
```

## 작업자 화면

로그인 화면 없이 바로 열립니다(시연 모드, 아래 참고). 배경은 접속한 시각에 맞춰 해가 뜨고 지는 하늘색으로 바뀌고 응원 문구가 나옵니다.

### 1. 출근 → 인수인계

**출근하기**를 누르면 배정된 구역의 인수인계 화면이 뜹니다.

- **이어서 할 작업**: 예) "선미 쪽 1.2m부터 이어서 작업"
- **공정 단계**: 전체 단계를 세로로 보여주고, 끝난 단계·지금 단계(진행률)·남은 단계를 구분
- **시작 전에 확인하세요**: 재가접 부위, 고장 장비, 화기 허가서 등. 어제 담당자에게 보낸 질문에 답이 아직 없으면 여기에 추가
- **마지막 작업자 보고**와 **작업 이력 보기**(어제 기록, 결함은 빨간 글씨)

**인수인계 확인**을 누르면 그 구역으로 위치가 등록되고 음성 스트리밍이 시작됩니다.
인수인계 기록은 지금 `backend/app/guides.py`의 시연 데이터이며, 실제로는 작업일지·MES 기록을 연결합니다.

### 2. 스트리밍 중

- 작업자 사진 주위에 말소리에 따라 그림자가 움직이고, 경과 시간이 표시됩니다.
- 음성은 10초 단위 클립으로 끊어 바로 서버에 올립니다(`POST /api/voice/clips`). 실패하면 휴대폰에 보관했다가 다시 보냅니다.
  원본 음성은 `backend/data/audio/`에 쌓이고, 관리자 화면 "최근 음성 기록"에서 들을 수 있습니다.
- 구역을 옮기면 그 구역 입구의 **NFC 태그**를 대거나, 아래 **다른 구역 QR로 등록**으로 QR을 찍습니다.
- 녹음 중에는 화면 꺼짐을 막습니다(Wake Lock).

> 실제 운영 시에는 작업자에게 녹음 사실을 고지하고 동의를 받아야 합니다.

### 3. 오봇에게 물어보기

- 버튼을 **한 번 누르면 듣기 시작, 다시 누르면 질문 전송**.
- 스트리밍 중인 마이크 소리를 함께 받아 질문 음성을 만들므로 **스트리밍은 끊기지 않습니다**(`capture/questionCapture.ts`).
- 서버가 작업자의 배정 작업·현재 구역·승인된 지침(`guides.py`)을 붙여 Gemini에 보내고, **지침 안에서만** 답합니다.
  지침에 없거나 안전·품질 판단이 필요하면 담당자 확인으로 돌립니다.
- 답변은 버튼 아래에 한 글자씩 써지며 화면 크기로 커지고, 다 써지면 작게 줄이거나 다시 키울 수 있습니다.
  **그림 보기**(기준면 그림 등), **담당자에게 확인**(관리자 화면에 실시간 알림) 버튼이 붙습니다.

### 4. 퇴근하기

화면 아래 **퇴근하기** → 확인 → 스트리밍 종료 · 퇴근 기록(작업구역 밖으로 이동) 후 **오늘의 업무 정리**가 나옵니다.

- 근무 시간, 머문 구역 수, 음성 기록 시간, 오봇 질문 수
- 오늘 한 일 / 다음에 할 일(남은 공정 단계) / 확인할 것(담당자 답변 대기, 다음 단계 주의사항)

숫자는 모두 서버 기록으로 계산하고, AI는 문장만 다듬습니다. AI가 18초 안에 답하지 않으면 같은 내용을 기본 문장으로 보여줍니다.

### 근무 시간 자동 종료 (지금은 꺼져 있음)

06:00–18:00(점심 12:00–13:00 제외)에만 스트리밍하고, 점심·퇴근 시각이 되면 자동 종료하는 기능이 있습니다.
**테스트를 위해 지금은 꺼 두었습니다.** 켜려면 `frontend/src/lib/workHours.ts`의 `ENFORCE_WORK_HOURS`를 `true`로 바꿉니다.
주소에 `?time=12.5`처럼 시각을 붙이면 그 시각 기준으로 배경·문구가 바뀝니다(시연용).

## 관리자 화면 (`/admin`)

구역별 현재 인원, 실시간 이동 기록, 미등록·확인 필요 작업자, 미등록 NFC 태그 경고, 최근 음성 기록(재생),
현장 질문(오봇 질문·담당자 확인 요청)을 실시간으로 보여줍니다.
`/admin/tags`에서 구역 QR을 인쇄하거나 Android Chrome에서 NFC 태그에 기록할 수 있습니다.

## 시연 모드 (로그인 없음)

| 주소 | 자동 로그인 계정 | 첫 화면 |
|---|---|---|
| `/` | 김민수 (W-001, 용접1팀 작업자) | 출근 화면 |
| `/admin` | 최서연 (W-004, 안전관리자) | 관리자 실시간 대시보드 |

- 작업자는 **서버가 결정**합니다(클라이언트는 `view: worker|admin`만 보냄 → `POST /api/demo/session`).
- 계정 변경: `OVOT_DEMO_WORKER_ID=W-003 python run.py` / 관리자: `OVOT_DEMO_ADMIN_ID`
- 시연 모드 끄기: `OVOT_DEMO_MODE=0` (`/api/demo/session`은 404, `POST /api/login`은 그대로 사용 가능, 비밀번호 `ovot1234`)
- 작업자·관리자 화면은 세션을 따로 저장하므로 한 브라우저에서 두 탭을 나란히 열 수 있습니다.

### NFC

- Android Chrome에서만 동작합니다(HTTPS 필요). 첫 접속 때 작업자 사진을 한 번 누르면 NFC 권한 요청 후 스캔이 시작되고, 이후에는 자동으로 대기합니다.
- 같은 태그 3초 내 중복 읽기는 무시하고, 서버는 30초 중복 등록을 막습니다.
- iPhone·PC는 NFC가 없으므로 QR로 등록합니다.

## 태그

| 태그 코드 | 구역 | 비고 |
|---|---|---|
| `OVOT-ZONE-A-001` | ZONE-A · B-01 중앙 블록 작업장 | 고위험 |
| `OVOT-ZONE-B-001` | ZONE-B · B-02 선수 블록 조립장 | 주의 |
| `OVOT-ZONE-C-001` | ZONE-C · C구역 검사장 | 일반 |
| `OVOT-ZONE-OUT-001` | ZONE-OUT · 작업구역 밖 | |
| `OVOT-ZONE-C-000` | ZONE-C | **사용 중지** 태그 (거부 시연용) |

태그에는 개인정보 없이 위 코드만 저장합니다. `/admin/tags` 에서 QR을 인쇄하거나, Android Chrome에서
"NFC 태그에 기록"으로 빈 NTAG 태그에 URL 레코드 + 텍스트 레코드를 기록할 수 있습니다.

## 시연 시나리오

1. PC에서 `/admin` → 관리자 대시보드 (상단 "실시간 연결됨" 확인)
2. 휴대폰에서 `/` → **출근하기** → 인수인계 확인 → B-01 중앙 블록 작업장 등록 + 스트리밍 시작
3. 관리자 화면: A구역 카드에 김민수 표시, 이동 기록에 `작업구역 밖 → B-01 중앙 블록 작업장`, 10초마다 음성 기록 추가
4. **오봇에게 물어보기** → "다음 순서가 뭐예요?" → 답변 → **담당자에게 확인** → 관리자 화면 현장 질문에 표시
5. **다른 구역 QR로 등록** → `/admin/tags`의 B구역 QR → 관리자 화면에서 A → B 이동
6. 등록되지 않은 태그(예: `OVOT-ZONE-X-999`)를 찍음 → 작업자에게 오류, 관리자 화면에 "미등록 NFC 태그 경고"
7. **퇴근하기** → 오늘의 업무 정리 → 관리자 화면에서 작업구역 밖으로 이동

## 배포 (Render)

**https://ovot.onrender.com** — GitHub `master`에 올리면 자동 배포됩니다(`render.yaml`, Docker).
Gemini 키는 Render 환경 변수 `GEMINI_API_KEY`에 넣습니다.
무료 요금제라 15분 미사용 시 잠들어 첫 접속이 30~60초 걸리고, 재시작하면 위치·녹음 데이터가 초기화됩니다.
배포할 때마다 `frontend/public/sw.js`의 `CACHE` 버전을 올려야 휴대폰에 새 화면이 반영됩니다.

## 휴대폰에서 NFC 시연하기 (HTTPS 필수)

Web NFC는 **Android Chrome + HTTPS(보안 컨텍스트)** 에서만 동작합니다. 카메라 QR도 HTTPS가 필요합니다.
iPhone은 Web NFC를 지원하지 않으므로 QR로 등록합니다.

- **방법 A — HTTPS 터널(권장)**: 서버 실행 후 예) `cloudflared tunnel --url http://localhost:8100`
  → 발급된 `https://….trycloudflare.com` 주소를 휴대폰 Chrome에서 열기. 한 주소로 API·WebSocket·PWA가 모두 동작합니다.
- **방법 B — USB 포트 포워딩**: 휴대폰 USB 디버깅 → PC Chrome `chrome://inspect` → Port forwarding `8100 → localhost:8100`
  → 휴대폰에서 `http://localhost:8100` (localhost는 보안 컨텍스트로 취급).
- **방법 C — 자체 서명 HTTPS**: `npm run dev:https` → 휴대폰에서 `https://<PC IP>:5173` 접속 후 인증서 경고 수락.

홈 화면 설치(앱 형태): 작업자 화면 상단 **"OVOT 앱 설치" → 설치** (또는 Chrome 메뉴 → "앱 설치").
설치하면 주소창 없는 전체 화면 앱으로 열리고, 아이콘을 길게 누르면 "위치 등록 / 관제" 바로가기가 있습니다.
설치된 앱은 **설치한 주소(origin)에 묶입니다.** 임시 터널 주소가 바뀌면 새 주소에서 다시 설치해야 하므로,
본 시연 전에는 고정 HTTPS 도메인을 쓰는 것이 좋습니다. iPhone은 Safari 공유 → "홈 화면에 추가"(NFC는 미지원).
QR을 휴대폰 기본 카메라로 찍으면 `/?tag=…&src=qr` 주소가 열리고, 앱에서 확인 후 등록합니다.

## API

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/demo/session` | 시연 모드 자동 세션 `{view: worker\|admin}` → `{token, worker}` |
| POST | `/api/login` · `/api/logout` | 로그인(UI 미사용) · 토큰 폐기 |
| GET | `/api/me` | 작업자 정보 + 현재 위치 + 배정 작업 |
| POST | `/api/location/check-in` | 구역 등록 `{tag_code, source?, client_time?, device_id?}` |
| GET | `/api/location/current` · `/history?limit=` | 내 현재 위치 · 이동 이력 |
| GET | `/api/workday/handover` | 출근 인수인계 (이어서 할 작업, 공정 단계, 확인할 것, 마지막 보고, 이력) |
| POST | `/api/workday/end` | 퇴근: 퇴근 기록 + 오늘의 업무 정리 |
| POST | `/api/voice/clips?duration_ms=&started_at=&location_event_id=` | 음성 클립 업로드 (본문: `audio/*`) |
| GET | `/api/assist/context` | 현재 작업 맥락 |
| POST | `/api/assist/quick` | `{kind: next\|tools\|cautions}` → 지침 기반 답변 |
| POST | `/api/assist/ask` | 질문 음성 → 답변 카드 |
| POST | `/api/assist/{log_id}/escalate` | 담당자에게 확인 요청 |
| GET | `/api/admin/workers/locations` · `/zones/state` · `/location/events` · `/tag-alerts` · `/tags` | 관리자 조회 |
| GET | `/api/admin/voice/clips` · `/{clip_id}/audio` | 음성 클립 목록 · 재생 (관리자) |
| GET | `/api/admin/assist` | 현장 질문 기록 (관리자) |
| WS | `/ws/location-events` | 첫 메시지 `{"type":"auth","token":"…"}` 후 실시간 사건 수신 (관리자) |

인증은 `Authorization: Bearer <token>`. API 문서: http://localhost:8100/docs

### 구역 등록 응답

```json
{
  "status": "changed",
  "worker_id": "W-001", "worker_name": "김민수",
  "zone_id": "ZONE-A", "zone_name": "B-01 중앙 블록 작업장",
  "previous_zone_id": "ZONE-OUT", "previous_zone_name": "작업구역 밖",
  "checked_in_at": "2026-10-09T14:30:00+09:00",
  "event_id": "EVT-LOCATION-000006", "tag_id": "TAG-A-001"
}
```

`status`: `changed`(이동) · `confirmed`(같은 구역 재확인, 중복 창 이후) · `duplicate`(중복 창 내 재스캔, 사건 미생성).
오류: `404 UNKNOWN_TAG`, `409 INACTIVE_TAG`, `409 INACTIVE_ZONE`, `400 INVALID_FORMAT`, `401 UNAUTHORIZED`.

### 구역 등록 처리 순서

1. 세션 토큰으로 작업자 확인 — 요청 본문의 `worker_id` 등은 **무시**
2. `tag_code` 정규화·형식 검증 → 3. 태그 활성 확인 → 4. 연결 구역 조회 (`TagVerifier`)
5. 기존 현재 위치 조회 → 같은 구역이 `OVOT_DUPLICATE_WINDOW_SECONDS`(기본 30초) 안이면 `duplicate`
6. `location_events`에 사건 **추가**(서버 시각 `occurred_at`, 클라이언트 시각은 `client_reported_at`에 참고용)
7. `worker_current_locations` 갱신 → 8. WebSocket 발행 → 9. 결과 반환

거부된 스캔은 `tag_scan_failures`에 저장되고 `tag_scan_rejected` 이벤트로 관리자에게 전송됩니다.

## 데이터 모델

- `workers`, `zones`, `nfc_tags`, `work_assignments`(배정 작업), `auth_sessions`
- `location_events` — **추가 전용** 위치 사건 (등록·이동·퇴근, 서버 시각 기록)
- `worker_current_locations` — 최신 위치
- `voice_clips` — 10초 음성 클립 (등록 사건에 연결)
- `assist_logs` — 오봇 질문·답변·담당자 확인 요청
- `tag_scan_failures` — 거부된 태그 스캔

DB는 `OVOT_DATABASE_URL`로 교체할 수 있습니다(SQLAlchemy; PostgreSQL 사용 시 드라이버 추가).
마지막 등록 후 `OVOT_STALE_AFTER_HOURS`(기본 8시간)가 지나면 "미등록·확인 필요"로 분류됩니다.

### 사건 구조 (확장 기준)

WebSocket과 API의 위치 사건은 다음 공통 필드를 포함합니다.

```json
{
  "event_id": "EVT-LOCATION-000006",
  "event_type": "worker_location_changed",
  "worker_id": "W-001",
  "zone_id": "ZONE-A",
  "previous_zone_id": "ZONE-OUT",
  "occurred_at": "2026-10-09T14:30:00+09:00",
  "source": "nfc",
  "source_tag_id": "TAG-A-001"
}
```

향후 `work_instruction`, `work_started`, `work_completed`, `work_delayed`, `work_changed`, `quality_issue`,
`safety_hazard`, `part_arrived`, `equipment_failure`, `acknowledgement`, `approval` 사건이 같은
`{type, data}` 메시지 채널(`EventHub`)과 `worker_id`·`zone_id` 키를 공유하도록 설계했습니다.

## 보안 및 한계 (해커톤 시연용)

- **일반 NFC 태그는 복제가 가능합니다.** 현재 버전(`StaticCodeTagVerifier`)은 해커톤 시연용입니다.
  운영 시에는 `TagVerifier` 인터페이스 구현만 교체해 동적 보안 태그(예: NTAG 424 DNA SUN/SDM 메시지 + CMAC 검증)나
  고정형 사원증 리더기로 전환합니다. 체크인 서비스·API는 그대로 둡니다.
- 태그에는 개인정보를 저장하지 않으며, 작업자 식별은 서버 세션으로만 합니다.
- 모든 위치 변경은 서버 시각으로 기록합니다.
- MVP 인증: PBKDF2 해시 + 서버 저장 불투명 토큰(12시간). 로그인 시도 제한, 세분화된 권한, SSO는 미구현입니다.
- 이벤트 허브는 단일 프로세스 메모리 기반입니다. 다중 인스턴스 운영 시 Redis pub/sub 등으로 교체가 필요합니다.
- Gemini API 키는 `backend/.env`에만 둡니다. git과 공유용 압축 파일에 넣지 않습니다.

## 아직 없는 것

음성 받아쓰기(STT)·노이즈 저감·현장 음성 요약, 디지털 트윈 3D, GPS 연속 추적,
MES·작업일지 실제 연동(지금은 `guides.py` 시연 데이터), 세분화된 권한, 서버 측 근무 시간 제한.

## 테스트

```bash
cd backend
python -m pytest -q
```

인증, 구역 등록 흐름 + WebSocket, 이동·중복 방지·재확인, 잘못된 태그, 관리자 권한, 음성 클립, 오봇 질문,
출근 인수인계, 퇴근 정리를 검증합니다.
