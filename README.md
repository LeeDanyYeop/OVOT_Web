# OVOT 웹 MVP — NFC 작업자 위치 등록

OVOT(One Voice, One Team) 1단계 MVP입니다. **작업자 신원(로그인 세션) + 작업구역(NFC 태그)** 을 연결해
위치 이동을 사건(event)으로 저장하고, 관리자 대시보드에 실시간으로 표시합니다.

```
김민수 로그인 → A구역 NFC 태그 스캔 → 서버가 위치 사건 저장 · 현재 위치 갱신
→ 작업자 화면 "A구역 3번 블록" → 관리자 화면 A구역 카드에 김민수 실시간 표시
```

> NFC 등록은 **작업구역 진입·이동 시점 기록**입니다. GPS 같은 연속 위치추적이 아닙니다.

## 구성

```
ovot-web/
├─ backend/             FastAPI + SQLAlchemy + SQLite
│  ├─ app/
│  │  ├─ main.py                  앱, 라우터, 빌드된 PWA 정적 서빙
│  │  ├─ models.py                workers, zones, nfc_tags, location_events, voice_clips …
│  │  ├─ services/location.py     체크인 처리(중복 방지, 사건 추가, 현재 위치 갱신)
│  │  ├─ services/tag_verifier.py 태그 검증 인터페이스 (보안 태그로 교체 가능)
│  │  ├─ services/event_hub.py    WebSocket 이벤트 허브
│  │  ├─ routers/                 auth, location, admin, voice, ws, client_log
│  │  └─ seed.py                  시연 데이터
│  ├─ tests/                      API·흐름 테스트 (pytest)
│  └─ run.py                      서버 실행 (기본 포트 8100, 클라우드는 PORT)
├─ frontend/            React + TypeScript + Vite PWA
│  ├─ public/
│  │  ├─ app-icon/                앱·탭 아이콘
│  │  ├─ avatars/                 작업자 사진 (W-001.jpg …)
│  │  ├─ logo.png, nfc-mark.png   상단 로고, NFC 마크
│  │  └─ manifest.webmanifest, sw.js
│  └─ src/
│     ├─ pages/                   Worker(작업자), Admin(관제), Tags(태그 관리)
│     ├─ components/              SpeakingAvatar, ProfileSheet, CodeEntrySheet …
│     ├─ scan/                    Web NFC, QR
│     └─ capture/                 음성 스트리밍(MediaRecorder)
├─ design/              원본 디자인 파일 (로고, 앱 아이콘, NFC 마크, 사진)
├─ scripts/             start.ps1, test.ps1, reset-demo.ps1
├─ .claude/launch.json  Claude 미리보기용 실행 설정
├─ Dockerfile, render.yaml, docker-compose.yml
└─ README.md
```

## 실행

요구사항: Python 3.11+, Node.js 20+ (둘 다 PATH에 있어야 합니다).

```powershell
# ovot-web 폴더에서 (Windows PowerShell)
powershell -ExecutionPolicy Bypass -File scripts/start.ps1        # 빌드 + 서버 → http://localhost:8100
powershell -ExecutionPolicy Bypass -File scripts/test.ps1         # 자동 시험
powershell -ExecutionPolicy Bypass -File scripts/reset-demo.ps1   # 로컬 시연 데이터 초기화
```

직접 실행할 때:

```bash
cd frontend && npm ci && npm run build      # PWA 빌드 (백엔드가 dist를 같이 서빙)
cd ../backend && pip install -r requirements.txt && python run.py
```

프런트엔드 개발 모드(HMR): 서버를 띄운 상태에서 `cd frontend && npm run dev` → http://localhost:5173
(`/api`, `/ws`는 8100으로 프록시). Docker: `docker compose up --build`.

## 작업자 화면 (2가지 상태만)

현장 작업자에게는 두 화면만 보입니다. 디자인은 Apple 제품 페이지처럼 흰 배경·검정 글자·넓은 여백으로 단순하게, 강조색만 갈색입니다.

1. **"NFC 태그를 대세요"**: 구역 입구 태그에 휴대폰을 대면 위치가 등록되고 곧바로 음성 스트리밍이 시작됩니다.
2. **"스트리밍 중"**: 등록된 구역, 경과 시간, [스트리밍 종료]. 다른 구역 태그를 대면 위치가 이동 등록되고 스트리밍은 이어집니다.

음성 스트리밍은 실제로 진행됩니다(MediaRecorder). 10초 단위 클립으로 끊어 바로 서버에 올리고(`POST /api/voice/clips`),
실패하면 휴대폰에 보관했다가 연결되면 다시 보냅니다. 각 클립은 **녹음이 시작될 때의 체크인 사건**에 묶여 저장되며,
서버는 그 사건이 같은 작업자의 것인지 확인합니다. 녹음 중에는 화면 꺼짐을 막습니다(Wake Lock).
STT·노이즈 저감·LLM 구조화는 아직 없고, 원본 음성만 `backend/data/audio/`에 쌓입니다.
관리자 화면 "최근 음성 기록"에서 들을 수 있습니다. NFC가 없는 기기는 하단 "QR로 등록"으로 구역 입구 QR을 찍습니다(태그 코드 직접 입력 기능은 없습니다).

> 실제 운영 시에는 작업자에게 녹음 사실을 고지하고 동의를 받아야 합니다.

**근무 시간 외 자동 종료**: 스트리밍은 06:00–18:00, 점심(12:00–13:00) 제외 시간에만 켜집니다
(`frontend/src/lib/workHours.ts`). 스트리밍 중 점심·퇴근 시각이 되면 30초 안에 자동 종료되고, 그 시간에 태그하면 위치만 등록됩니다.
시연용으로 주소에 `?time=12.5`처럼 시각을 붙이면 그 시각으로 동작합니다(배경 하늘·응원 문구도 같이 바뀜).
현재 이 판단은 휴대폰 시계 기준이며, 서버에서 막는 기능은 아직 없습니다.

## 오봇에게 물어보기 (작업 도움)

스트리밍 화면의 **오봇에게 물어보기** → `다음 순서` `준비물` `주의사항` 또는 🎙 **직접 질문**.
답변은 한 장의 카드(핵심 한 문장 → 근거·그림 → `그림 보기` `관련 지침` `담당자에게 확인`)로 보여주고, 닫으면 바로 작업으로 돌아갑니다.

- **맥락은 서버가 붙입니다**: 작업자가 작업·구역·단계를 설명할 필요 없이, 서버가 세션 작업자의 배정 작업·현재 위치·승인된 지침(`backend/app/guides.py`)을 찾아 씁니다.
- **빠른 질문 3개는 AI 없이 승인된 지침만으로 답합니다** (정확·즉시).
- **직접 질문은 마이크를 새로 켜지 않습니다**: 이미 스트리밍 중인 마이크 소리를 Web Audio로 함께 받아 16kHz WAV로 만들어 보냅니다(`frontend/src/capture/questionCapture.ts`). 그래서 스트리밍 녹음은 끊기지 않습니다. 누른 채 말하고 떼거나, 짧게 눌러 시작·다시 눌러 끝.
- 직접 질문은 `GEMINI_API_KEY`가 있으면 Gemini(`GEMINI_MODEL`, 기본 gemini-3.6-flash)가 음성을 받아 지침 안에서만 답합니다. 지침에 없거나 안전·품질 판단이 필요하면 `담당자 확인 필요`로 돌립니다. 키가 없으면 안내 카드를 보여주고 질문 음성은 저장됩니다.
- 질문·답변·담당자 확인 요청은 기록되어 관리자 화면 **현장 질문** 패널에 실시간으로 뜹니다.

## 시연 모드 (로그인 없음)

해커톤 시연용으로 **로그인 화면이 없습니다.** 접속하면 서버가 정해진 시연 계정의 세션을 자동 발급합니다.

| 주소 | 자동 로그인 계정 | 첫 화면 |
|---|---|---|
| `/` | 김민수 (W-001, 용접1팀 작업자) | **"NFC 태그를 대세요"** 화면 |
| `/admin` | 최서연 (W-004, 안전관리자) | 관리자 실시간 대시보드 |

- 작업자는 여전히 **서버가 결정**합니다(클라이언트는 `view: worker|admin`만 보냄 → `POST /api/demo/session`).
- 계정 변경: `OVOT_DEMO_WORKER_ID=W-003 python run.py` / 관리자: `OVOT_DEMO_ADMIN_ID`
- 시연 모드 끄기: `OVOT_DEMO_MODE=0` (이 경우 `/api/demo/session`은 404, `POST /api/login`은 그대로 사용 가능)
- 작업자 화면과 관리자 화면은 세션을 따로 저장하므로 한 브라우저에서 두 탭을 나란히 열 수 있습니다.

### NFC 스캔 시작

- Android Chrome 첫 접속: 큰 패널을 **한 번 누르면** NFC 권한 요청 후 스캔이 시작됩니다(브라우저 정책상 첫 스캔은 사용자 동작 필요).
- 권한을 한 번 허용한 뒤부터는 **화면이 열리면 자동으로 스캔 대기**합니다.
- 스캔은 계속 유지되므로 태그를 연속으로 찍어도 됩니다(같은 태그 3초 내 중복 읽기 무시, 서버는 30초 중복 방지).
- NFC 미지원 기기(iPhone, PC)는 "QR로 등록" 버튼이 주 버튼으로 바뀌고, 누르면 카메라가 바로 켜집니다.

## 태그

| 태그 코드 | 구역 | 비고 |
|---|---|---|
| `OVOT-ZONE-A-001` | ZONE-A · A구역 3번 블록 | 고위험 |
| `OVOT-ZONE-B-001` | ZONE-B · B구역 조립장 | 주의 |
| `OVOT-ZONE-C-001` | ZONE-C · C구역 검사장 | 일반 |
| `OVOT-ZONE-OUT-001` | ZONE-OUT · 작업구역 밖 | |
| `OVOT-ZONE-C-000` | ZONE-C | **사용 중지** 태그 (거부 시연용) |

태그에는 개인정보 없이 위 코드만 저장합니다. `/admin/tags` 에서 QR을 인쇄하거나, Android Chrome에서
"NFC 태그에 기록"으로 빈 NTAG 태그에 URL 레코드 + 텍스트 레코드를 기록할 수 있습니다.

## 시연 시나리오

1. PC 브라우저에서 `/admin` → 관리자 대시보드 (상단 "실시간 연결됨" 확인)
2. 휴대폰(또는 다른 탭)에서 `/` → 김민수 화면 "NFC 태그를 대세요", 현재 위치 "작업구역 밖"
3. A구역 태그에 휴대폰을 댄다 (NFC가 없으면 **QR로 등록** → `/admin/tags`에서 띄운 A구역 QR을 찍음)
4. 작업자 화면: "A구역 3번 블록", 현재 작업 "상태: 작업 가능", 최근 이동에 기록 추가
5. 관리자 화면: A구역 카드에 김민수가 강조 표시되고, 실시간 이동 기록 맨 위에 `작업구역 밖 → A구역 3번 블록`
6. B구역 태그 등록 → 관리자 화면에서 A → B로 이동
7. 등록되지 않은 태그(예: `OVOT-ZONE-X-999`를 기록한 NFC 태그나 QR)를 찍음 → 작업자에게 빨간 오류, 관리자 화면에 "미등록 NFC 태그 경고"
8. 같은 태그 연속 스캔 → "이미 등록된 위치입니다" (사건 미생성)
9. 새로고침해도 위치·이력 유지

## 배포 주소 (Render)

**https://ovot.onrender.com** — 작업자 화면 `/`, 관리자 화면 `/admin`. GitHub `master`에 올리면 자동 배포됩니다(`render.yaml`).
무료 요금제라 15분 미사용 시 잠들어 첫 접속이 30~60초 걸리고, 재시작하면 위치·녹음 데이터가 초기화됩니다.

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
| POST | `/api/login` | `{employee_number, password}` → `{token, worker}` (UI 미사용, 시연 계정 비밀번호 `ovot1234`) |
| POST | `/api/logout` | 토큰 폐기 |
| GET | `/api/me` | 작업자 정보 + 현재 위치 + 배정 작업 |
| POST | `/api/location/check-in` | `{tag_code, source?, client_time?, device_id?}` |
| GET | `/api/location/current` | 내 현재 위치 |
| GET | `/api/location/history?limit=` | 내 위치 이동 이력 |
| GET | `/api/admin/workers/locations` | 요약 + 작업자별 현재 위치 (관리자) |
| GET | `/api/admin/zones/state` | 구역 중심 상태 (디지털 트윈 연계용) |
| GET | `/api/admin/location/events?limit=` | 전체 위치 사건 |
| GET | `/api/admin/tag-alerts` | 거부된 태그 스캔 |
| GET | `/api/admin/tags` | 태그 목록 |
| POST | `/api/voice/clips?duration_ms=&started_at=&location_event_id=` | 음성 클립 업로드 (본문: `audio/*` 원본) |
| GET | `/api/admin/voice/clips` · `/{clip_id}/audio` | 음성 클립 목록 · 재생 (관리자) |
| GET | `/api/assist/context` | 현재 작업 맥락(작업·구역·단계) |
| POST | `/api/assist/quick` | `{kind: next\|tools\|cautions}` → 지침 기반 답변 카드 |
| POST | `/api/assist/ask` | 질문 음성(`audio/*` 원본) → 답변 카드 |
| POST | `/api/assist/{log_id}/escalate` | 담당자에게 확인 요청 |
| GET | `/api/admin/assist` | 현장 질문 기록 (관리자) |
| WS | `/ws/location-events` | 첫 메시지 `{"type":"auth","token":"…"}` 후 실시간 사건 수신 (관리자) |

인증은 `Authorization: Bearer <token>`. API 문서: http://localhost:8100/docs

체크인 응답 예:

```json
{
  "status": "changed",
  "worker_id": "W-001", "worker_name": "김민수",
  "zone_id": "ZONE-A", "zone_name": "A구역 3번 블록",
  "previous_zone_id": "ZONE-OUT", "previous_zone_name": "작업구역 밖",
  "checked_in_at": "2026-10-09T14:30:00+09:00",
  "event_id": "EVT-LOCATION-000006", "tag_id": "TAG-A-001"
}
```

`status`: `changed`(이동) · `confirmed`(같은 구역 재확인, 중복 창 이후) · `duplicate`(중복 창 내 재스캔, 사건 미생성).
오류: `404 UNKNOWN_TAG`, `409 INACTIVE_TAG`, `409 INACTIVE_ZONE`, `400 INVALID_FORMAT`, `401 UNAUTHORIZED`.

### 체크인 처리 순서

1. 세션 토큰으로 작업자 확인 — 요청 본문의 `worker_id` 등은 **무시**
2. `tag_code` 정규화·형식 검증 → 3. 태그 활성 확인 → 4. 연결 구역 조회 (`TagVerifier`)
5. 기존 현재 위치 조회 → 같은 구역이 `OVOT_DUPLICATE_WINDOW_SECONDS`(기본 30초) 안이면 `duplicate`
6. `location_events`에 사건 **추가**(서버 시각 `occurred_at`, 클라이언트 시각은 `client_reported_at`에 참고용)
7. `worker_current_locations` 갱신 → 8. WebSocket 발행 → 9. 결과 반환

거부된 스캔은 `tag_scan_failures`에 저장되고 `tag_scan_rejected` 이벤트로 관리자에게 전송됩니다.

## 데이터 모델

- `workers` (id, employee_number, name, role, team, password_hash(PBKDF2), is_admin, is_active)
- `zones` (id, name, description, risk_level, is_work_area, is_active)
- `nfc_tags` (id, tag_code, zone_id, label, is_active, installed_at)
- `location_events` — **추가 전용**. id, event_id, event_type, worker_id, zone_id, previous_zone_id, tag_id,
  source(nfc/qr/manual), occurred_at(서버), client_reported_at, device_id, user_agent
- `worker_current_locations` — 최신 위치 투영 (worker_id, zone_id, updated_at, source_event_id)
- `work_assignments` — 현재 배정 작업 (향후 work_instruction 사건으로 대체)
- `tag_scan_failures`, `auth_sessions`

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

## 이번 단계에서 제외

LLM·STT·노이즈 저감·디지털 트윈 3D·GPS 연속 추적·ERP/MES 연동·복잡한 권한·생체 인증.
음성은 녹음·업로드·저장까지만 합니다(`frontend/src/capture/voiceCapture.ts`, `backend/app/routers/voice.py`).

## 테스트

```bash
cd ovot-web/backend
python -m pytest -q
```

로그인/인증 거부, 전체 체크인 흐름 + WebSocket 수신, 구역 이동, 중복 방지, 재확인, 미등록·비활성·형식 오류 태그,
관리자 권한, 요약 수치, 로그아웃을 검증합니다.
