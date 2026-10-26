# OVOT Backend

조선소 작업자 음성 기반 작업 관리 및 작업장 간 협업 시스템 — FastAPI 백엔드.

```
작업자 음성 → STT → AI Agent → FastAPI → PostgreSQL → 웹사이트 GUI / Unity
```

웹사이트 GUI, AI Agent, Unity 디지털 트윈은 PostgreSQL 에 **직접 접근하지 않고**
이 FastAPI 서버를 통해서만 데이터를 주고받는다.

---

## 1. 실행 방법

### 1-1. 환경

- Python 3.13 (Anaconda 가상환경 `SQL`)
- PostgreSQL 18, 기존 DB `ovot_db`

### 1-2. 패키지 설치

```powershell
conda activate SQL
pip install -r requirements.txt
```

### 1-3. 환경변수 설정

```powershell
Copy-Item .env.example .env
```

`.env` 를 열어 `POSTGRES_PASSWORD` 등 실제 접속 정보를 입력한다. `.env` 는
`.gitignore` 에 등록되어 있어 Git 에 커밋되지 않는다.

### 1-4. 서버 실행

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- 상태 확인: http://localhost:8000/health , http://localhost:8000/health/db

### 1-5. 테스트 실행

```powershell
pytest -v
```

실제 `ovot_db` 에 대해 동작하는 통합 테스트다. 각 테스트는 자신이 만든 행만
생성·삭제하며, 기존 시드 데이터(tasks 3건, voice_records 1건, events 1건,
event_types 25건, speech_types 5건)를 건드리지 않는다. 2026-10-09 기준 **26개
테스트 전부 통과**, 테스트 후 DB 행 수가 테스트 전과 동일함을 확인했다.

---

## 2. 프로젝트 구조

```
OVOT-Backend/
├── main.py              FastAPI 앱, CORS, 공통 에러 응답, 라우터 등록
├── config.py            환경변수 설정 (pydantic-settings)
├── database.py          SQLAlchemy 엔진/세션, DB ping
├── models.py            기존 테이블에 매핑되는 ORM 모델 (스키마 생성 안 함)
├── schemas.py           Pydantic 요청/응답 스키마, 입력 검증
├── constants.py         고정 상태 코드 (이벤트 처리상태 4종, 인계상태 5종, 작업상태)
├── routers/
│   ├── tasks.py         GET /tasks, GET /tasks/{id}, PATCH /tasks/{id}/status
│   ├── voice_records.py POST/GET /voice-records
│   ├── events.py        POST/GET /events, PATCH /events/{id}/status,
│   │                    GET /event-types, GET /speech-types
│   └── handoffs.py       POST/GET /handoffs, PATCH /handoffs/{id}/status
├── migrations/           실행한 DDL (순서대로, 전부 비파괴적)
├── tools/inspect_db.py    DB 읽기 전용 점검 스크립트
├── tests/test_api.py      통합 테스트 (pytest)
├── .env.example
├── requirements.txt
└── README.md
```

---

## 3. 데이터베이스 변경 사항 (2026-10-09 적용, 전부 비파괴적)

점검 결과 기존 데이터는 모두 보존되며, 아래 5개 마이그레이션을 실행했다
(`migrations/001`~`005`). `migrations/006` 은 이벤트 코드 시딩용 idempotent
스크립트로, 현재 DB 에는 이미 전부 등록되어 있어 실행해도 변화가 없다
(다른 환경에 재배포할 때를 위해 보관).

| 파일 | 변경 | 기존 데이터 영향 |
|---|---|---|
| 001 | `events.voice_id` UNIQUE 제거 → 1발화 N이벤트 허용 | 없음 |
| 002 | `events.speech_type` 컬럼 추가 (FK → speech_types) | 없음 (기존 행은 NULL) |
| 003 | `events.event_type` → `event_types` FK 추가 (**NOT VALID**) | 없음 |
| 004 | `events.event_status` CHECK 제약 추가 (처리 상태 4종) | 없음 |
| 005 | `handoffs` 테이블 신규 생성 | 없음 (새 테이블) |

### 3-1. 구형 이벤트 코드 처리 (중요)

점검 시 `events` 테이블에 표준 25개 코드에 속하지 않는 구형 값이 1건
발견되었다: `event_id=1`, `event_type='WORK_PRIORITY_CHANGED'` (의미상
`(WI) PRIORITY` 와 유사).

이 값을 고치지 않고 그대로 보존하기로 했다. 대신 FK 를 `NOT VALID` 로
추가해 **기존 행은 그대로 두면서 앞으로 들어오는 모든 이벤트는 반드시
표준 코드를 참조하도록** 강제했다. 팀이 이 구형 데이터를 정리하기로
결정하면 아래 SQL 로 완전한 검증 상태로 전환할 수 있다:

```sql
UPDATE events SET event_type = '(WI) PRIORITY' WHERE event_type = 'WORK_PRIORITY_CHANGED';
ALTER TABLE events VALIDATE CONSTRAINT events_event_type_fkey;
```

### 3-2. `tasks.status` 값 집합에 대한 가정

팀에서 작업 상태의 전체 값 집합을 아직 확정하지 않았다. 현재 DB 에는
`PENDING` 만 존재한다. API 레벨(`constants.TASK_STATUSES`)에서 임시로
`PENDING / IN_PROGRESS / DONE / CANCELLED` 를 허용값으로 두었다. DB 에는
CHECK 제약을 걸지 않았으므로, 팀이 값을 확정하면 `constants.py` 한 곳만
수정하면 된다.

---

## 4. REST API 요약

모든 에러 응답은 다음 형식을 따른다:

```json
{ "error": true, "status_code": 404, "message": "작업을 찾을 수 없습니다: T-999" }
```

422 검증 오류는 `details` 배열에 필드별 사유가 추가로 담긴다.

| Method | Path | 설명 |
|---|---|---|
| GET | `/health` | 서버 실행 상태 |
| GET | `/health/db` | PostgreSQL 연결 상태 (실패 시 503) |
| GET | `/tasks` | 작업 목록 (zone_id/block_id/status 필터 가능) |
| GET | `/tasks/{task_id}` | 작업 단건 (없으면 404) |
| PATCH | `/tasks/{task_id}/status` | 작업 상태 변경 |
| POST | `/voice-records` | STT 전사문 저장 (voice_id 생략 시 자동 생성) |
| GET | `/voice-records` | 발화 기록 조회 (task_id/worker_id/zone_id 필터) |
| POST | `/events` | AI Agent 분석 결과 저장 (섹션 5 참고) |
| GET | `/events` | 이벤트 목록 조회 (여러 필터 지원) |
| PATCH | `/events/{event_id}/status` | 이벤트 처리 상태 변경(확인/반려)* |
| GET | `/event-types` | 등록된 이벤트 코드 25개 |
| GET | `/speech-types` | 발화 의도 코드 5개 |
| POST | `/handoffs` | 인계 요청 생성 |
| GET | `/handoffs` | 인계 요청 목록 (task_id/status/zone 필터) |
| PATCH | `/handoffs/{handoff_id}/status` | 인계 수락/진행/완료/반려 |

\* `PATCH /events/{id}/status` 는 최초 API 목록에는 없었지만, "FastAPI 는
확인 요청 및 처리 결과를 관리한다"(요구사항 5-4)를 충족하기 위해 추가한
엔드포인트다. 웹사이트 GUI 가 `NEEDS_CONFIRMATION` 상태인 이벤트를 사람이
확인/반려할 때 호출한다.

### 4-1. 인계(handoff) 상태 전이 규칙

```
REQUESTED → ACCEPTED → IN_PROGRESS → DONE
     ↘          ↘            ↘
   REJECTED   REJECTED    REJECTED
```

정의되지 않은 전이(예: `DONE` 이후 변경, `REQUESTED`→`DONE` 건너뛰기)는
**409 Conflict** 를 반환한다. 작업 상태(`tasks.status`)와 인계 상태
(`handoffs.status`)는 서로 다른 개념으로, 인계가 수락되어도 작업 상태는
자동으로 바뀌지 않는다 — 웹사이트/AI Agent 가 필요하면 `PATCH
/tasks/{id}/status` 를 별도로 호출한다.

---

## 5. AI Agent 연동 규격

`POST /events` 로 아래 형식의 JSON 을 전송한다:

```json
{
  "voice_id": "V-002",
  "task_id": "T-001",
  "speech_type": "CMD",
  "event_type": "(WI) PRIORITY",
  "summary": "4번 보강재 치수 확인을 우선하도록 지시",
  "requires_confirmation": false
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `voice_id` | string | ✅ | 이미 `POST /voice-records` 로 저장된 발화 ID |
| `task_id` | string \| null | ❌ | 관련 작업 ID (없을 수 있음, 예: 안전 이벤트) |
| `speech_type` | string | ✅ | `GET /speech-types` 에 등록된 5개 코드 중 하나 |
| `event_type` | string | ✅ | `GET /event-types` 에 등록된 25개 코드 중 하나 |
| `summary` | string \| null | ❌ | 이벤트 요약 |
| `requires_confirmation` | boolean | ❌ (기본 false) | 모호해서 사람 확인이 필요하면 true |

처리 순서 (FastAPI 가 수행):

1. Pydantic 으로 JSON 형식 검증
2. `voice_id` 존재 확인 → 없으면 `404`
3. `task_id` 존재 확인(제공된 경우) → 없으면 `404`
4. `event_type` 이 `event_types` 테이블에 등록돼 있는지 확인 → 없으면 `422`
5. `speech_type` 이 `speech_types` 테이블에 등록돼 있는지 확인 → 없으면 `422`
6. `requires_confirmation` 에 따라 `event_status` 결정:
   - `false` → `PENDING_VALIDATION`
   - `true` → `NEEDS_CONFIRMATION`
7. PostgreSQL 저장 (트랜잭션)
8. 저장된 이벤트를 JSON 으로 반환 (`event_id` 포함)

**한 발화에서 여러 이벤트**: `events.voice_id` 에 UNIQUE 제약이 없으므로,
같은 `voice_id` 로 `POST /events` 를 여러 번 호출하면 된다. AI Agent 가
한 발화에서 N 개 이벤트를 추출했다면 N 번 호출한다 (한 번에 배열로 보내는
방식은 아직 구현하지 않았으나, 라우터 구조상 쉽게 확장 가능하다).

성공 응답 예시 (`201 Created`):

```json
{
  "event_id": 2,
  "voice_id": "V-002",
  "task_id": "T-001",
  "event_type": "(WI) PRIORITY",
  "event_status": "PENDING_VALIDATION",
  "speech_type": "CMD",
  "summary": "4번 보강재 치수 확인을 우선하도록 지시",
  "created_at": "2026-10-09T23:29:22.615219+09:00"
}
```

AI Agent 가 아직 없으므로 `/docs` 의 Swagger UI 에서 "Try it out" 으로
위 JSON 을 직접 테스트할 수 있다.

---

## 6. 웹사이트 GUI 연동 가이드

> 이 프로젝트에는 웹사이트 소스코드가 없다 (별도 팀원 개발 중). 아래는
> 연동 담당자가 그대로 복붙해 쓸 수 있는 fetch 예제다.

### 6-1. 기본 설정

- API Base URL: 배포 시 팀에 전달 (개발 중에는 `http://localhost:8000`)
- 모든 요청/응답은 JSON
- CORS: `.env` 의 `CORS_ORIGINS` 에 프런트엔드 개발 서버 주소를 등록해야
  브라우저에서 호출 가능하다 (와일드카드 미사용). 기본값에
  `http://localhost:5173`(Vite), `http://localhost:3000`(CRA/Next) 포함.

### 6-2. 작업 목록 조회 → 상태 변경 → 재조회

```javascript
const API_BASE = "http://localhost:8000";

// 1. 작업 목록 조회
async function fetchTasks() {
  const res = await fetch(`${API_BASE}/tasks`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? "작업 목록 조회 실패");
  }
  return res.json(); // [{ task_id, block_id, zone_id, task_type, status, updated_at }, ...]
}

// 2. "작업 시작" 버튼 클릭 시
async function startTask(taskId) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "IN_PROGRESS" }),
  });
  if (res.status === 404) throw new Error("존재하지 않는 작업입니다.");
  if (res.status === 422) throw new Error("허용되지 않는 상태값입니다.");
  if (!res.ok) throw new Error("상태 변경 실패");
  return res.json();
}

// 3. 변경 후 재조회해서 화면 갱신
async function onStartButtonClick(taskId) {
  await startTask(taskId);
  const tasks = await fetchTasks(); // 최신 상태로 다시 그리기
  renderTaskList(tasks);
}
```

### 6-3. Axios 버전

```javascript
import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:8000" });

export const getTasks = () => api.get("/tasks").then((r) => r.data);
export const updateTaskStatus = (taskId, status) =>
  api.patch(`/tasks/${taskId}/status`, { status }).then((r) => r.data);

export const getEvents = (params) => api.get("/events", { params }).then((r) => r.data);
export const confirmEvent = (eventId, event_status) =>
  api.patch(`/events/${eventId}/status`, { event_status }).then((r) => r.data);

export const createHandoff = (task_id, from_zone_id, to_zone_id) =>
  api.post("/handoffs", { task_id, from_zone_id, to_zone_id }).then((r) => r.data);
export const updateHandoffStatus = (handoffId, status) =>
  api.patch(`/handoffs/${handoffId}/status`, { status }).then((r) => r.data);

// 에러 처리 (공통 포맷 { error, status_code, message })
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const body = err.response?.data;
    throw new Error(body?.message ?? "요청 처리 중 오류가 발생했습니다.");
  }
);
```

### 6-4. 확인 필요 이벤트(NEEDS_CONFIRMATION) 목록 보여주기

```javascript
async function fetchPendingConfirmations() {
  const res = await fetch(`${API_BASE}/events?event_status=NEEDS_CONFIRMATION`);
  return res.json();
}

async function confirmOrReject(eventId, approve) {
  await fetch(`${API_BASE}/events/${eventId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_status: approve ? "CONFIRMED" : "REJECTED" }),
  });
}
```

---

## 7. 수동 API 테스트 (Swagger UI 없이)

```powershell
# 서버 상태
curl http://localhost:8000/health
curl http://localhost:8000/health/db

# 작업 목록
curl http://localhost:8000/tasks

# 작업 상태 변경
curl -X PATCH http://localhost:8000/tasks/T-001/status `
  -H "Content-Type: application/json" -d '{\"status\":\"IN_PROGRESS\"}'

# 발화 기록 저장
curl -X POST http://localhost:8000/voice-records `
  -H "Content-Type: application/json" `
  -d '{\"worker_id\":\"W-001\",\"task_id\":\"T-001\",\"transcript\":\"테스트 발화\"}'

# AI Agent 이벤트 저장
curl -X POST http://localhost:8000/events `
  -H "Content-Type: application/json" `
  -d '{\"voice_id\":\"V-001\",\"task_id\":\"T-001\",\"speech_type\":\"CMD\",\"event_type\":\"(WI) PRIORITY\",\"summary\":\"test\"}'
```

---

## 8. 테스트 결과 (2026-10-09)

- `pytest -v` : **26 passed**
- 커버한 케이스: 정상 입력, 존재하지 않는 task/voice/event/handoff ID(404),
  잘못된 event_type/speech_type/status 값(422), 동일 voice_id 중복 이벤트
  (1발화 N이벤트 정상 동작), handoff 상태 머신 위반 전이(409), 중복
  voice_id 생성 시도(422), DB 연결 상태(`/health/db`)
- 테스트 전후 기존 시드 데이터(tasks 3 / voice_records 1 / events 1 /
  event_types 25 / speech_types 5) 행 수 동일 — **기존 데이터 보존 확인**
- DB 연결 실패 시나리오는 잘못된 비밀번호로 별도 엔진을 만들어 확인:
  `OperationalError` 발생 → `/health/db` 핸들러가 이를 잡아 `503` 반환하는
  코드 경로를 검증함 (운영 중인 서버의 실제 DB 연결은 끊지 않았음).

---

## AI 음성 처리 (CRN 노이즈 제거 + Whisper STT)

`ai/` 패키지는 `K-조선해커톤/ai` 의 학습 완료 모델(denoiser.pt, CRN)과 판정 로직을 그대로 재사용한다.

```powershell
conda activate SQL
pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cu128   # GPU (CPU만 쓰면 생략 가능)
pip install -r requirements.txt
psql -U postgres -d ovot_db -f migrations/007_create_audio_processing.sql       # 1회 (재실행 안전)
uvicorn main:app --host 0.0.0.0 --port 8000
```

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/audio/status` | 모델 로딩 상태 |
| POST | `/audio/process` | multipart: `audio_file`(16kHz WAV), `worker_id`, `zone_id`, `block_id`, `task_id`, `denoise_mode`(auto/on/off) |
| GET | `/audio/results` | 처리 이력 목록 (status/voice_id/task_id/worker_id/zone_id/audio_sha256 필터) |
| GET | `/audio/results/{id}` | 단건 (전사문은 voice_records 에서 조인) |
| GET | `/audio/results/{id}/original` · `/enhanced` | WAV 다운로드 |

- 노이즈 단계: 추정 SNR > 23 → 1, > 11 → 2, > 3.5 → 3, > -1 → 4, 이하 → 5. `auto` 는 4·5단계만 정제음으로 전사.
- 상태: PENDING → PROCESSING → COMPLETED(voice_records 생성) / NO_SPEECH(전사문 없음) / FAILED(error_message).
- 파일: `audio_storage/original|enhanced/YYYYMMDD/<uuid>.wav` (DB 에는 상대경로).
- 동시 추론 1건 (`AI_MAX_CONCURRENT`), 업로드 50MB / 600초 제한. 설정은 `.env.example` 참고.
- 테스트: `python tests/make_test_audio.py` 후 `pytest -v`.
