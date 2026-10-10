# OVOT 관리자 관제 웹 (admin-console)

OVOT-Backend(FastAPI)를 통해 PostgreSQL 데이터를 조회·처리하는 관리자 화면입니다.
브라우저는 FastAPI 만 호출하며, DB 에 직접 접속하지 않습니다. DB 비밀번호는 이 프로젝트 어디에도 두지 않습니다.

```
관리자 웹 (이 프로젝트) ──HTTP──▶ OVOT-Backend (FastAPI :8000) ──▶ PostgreSQL ovot_db
        └─(선택) Unity WebGL ◀── 웹이 받은 데이터만 전달 (Unity 는 DB·API 에 직접 접근하지 않음)
```

## 1. 실행

필요: Node.js 18 이상, 실행 중인 OVOT-Backend.

```powershell
cd admin-console
npm install
npm run dev          # http://localhost:5173
```

- 5173 포트는 OVOT-Backend `.env` 의 기본 `CORS_ORIGINS` 에 이미 들어 있습니다.
- 다른 주소·포트로 띄우면 OVOT-Backend `.env` 의 `CORS_ORIGINS` 에 그 주소를 추가하고 서버를 재시작해야 합니다.

배포용 빌드: `npm run build` → `dist/` 폴더를 정적 웹 서버에 올리면 됩니다 (상대 경로로 빌드되어 하위 경로에서도 동작).

## 1-1. 화면 레이아웃

| 주소 | 화면 |
|---|---|
| `http://localhost:5173/` | **기본 · 흰 배경 작업장 화면** (X Money 참고) |
| `?layout=canvas` | 어두운 점 구름 선박 화면 (이전 버전) |
| `?layout=classic` | 처음 만든 4분할 화면 |

기본 화면 구성
- 왼쪽 글자 메뉴: 현황 / 확인 요청 / 현장 대화 / 작업·인계 / 설정 (작업구역은 현황 아래 타일로 들어가며, `#/zones` 는 현황으로 이동). 맨 아래 연결 상태·마지막 갱신·관리자 버튼.
- 현황: 큰 제목 2줄 + 본문 전체 폭 3D 점 작업장(블록 조립장·공장동·도크 선박·안벽·골리앗 크레인, 한 바퀴 60초로 천천히 회전) + `01~05` 구역 타일.
  - 회전은 구역도에 마우스를 올리면 멈추고, 화면 밖·탭 숨김·동작 줄이기 설정이면 멈춥니다. 회전 중에는 픽셀 버퍼에 직접 그려 60fps 를 유지합니다.
  - 구역도의 구역에 마우스를 올리면 아래 같은 구역 타일이 파란 테두리로 강조되고 나머지는 흐려집니다. 타일에 올리면 구역도에서 그 구역만 남기고 흐려집니다. 키보드 포커스도 같습니다.
  - 진행률 계산 기준은 범례 옆 ⓘ 에 마우스를 올리면 보입니다.
  - 현황 구역도는 검은 무대(#05070D)입니다: 0~0.8초 점이 가운데 한 점에서 퍼져 나와 작업장이 되고, 뒤쪽 점은 어둡고 앞쪽 점은 밝게 그립니다. 바닥에 옅은 파란 대기 빛.
  - 가운데 '관제' 표시에서 **서버 작업 데이터가 있는 구역**으로 강조색 호가 0.4초 간격으로 날아가고(머리가 가장 밝음), 도착하면 파동이 퍼집니다. 왼쪽 아래 '연결 구역' 수가 하나씩 올라갑니다 (작업 데이터가 없는 D·E 는 호를 그리지 않으므로 지금은 3).
  - 구역 타일은 5열 한 줄 (1180px 이하 3열, 760px 이하 2열, 520px 이하 1열). 구역을 누르면 `#/zone/ZONE-A` 같은 구역 디지털트윈 화면으로 이동.
- 구역 화면: 디지털트윈 자리(지금은 점 미니맵, `ovot-config.json` 의 unity 설정 시 Unity WebGL) + `01 작업 목록 · 02 확인 요청 · 03 현장 대화 · 04 작업·인계`.
- 맨 아래 고정: 전체(구역 화면에서는 그 구역) 작업 진행도와 A~E 구역별 작은 막대. 연결이 끊기면 회색 + "마지막 갱신 HH:MM 기준".
- 점 색: 구역 점 중 **완료 비율만큼 #007EEC 불투명(투명도 0%)**, 나머지는 **투명도 50%**(흰 바탕 기준 #80BFF6 로 칠해 겹쳐도 진해지지 않게). 작업이 없는 구역은 회색, 구역 밖 시설(크레인·바닥·바다)은 옅은 회색.
- **진행률 = 완료(DONE) 작업 ÷ (전체 − 취소)** — 서버에 작업별 세부 진척률이 없어 `tasks.status` 로만 계산.
- 색: 바깥 #F4F4F5, 창 #FFFFFF, 타일 #F2F2F2, 글자 #111/#3A3A3C/#8E8E93, 강조 #007EEC 하나 (오류만 빨강). 글꼴 Pretendard(파일 포함).
- 점 밀도: 전체 구역도 약 2.5배, 구역 화면 약 2배(구역 점 합계 29,232개). 점 크기 1.2~1.8px, 0.8초 올라오는 연출 후에는 다시 그리지 않음(구역 hover·진행률 변경 시에만).
- **골리앗 크레인은 C구역 소속**(`zone-map.json` 의 ZONE-C `scene: ["shipAft","gantry"]`) — C 진행률에 따라 색이 바뀝니다. 다른 구역으로 옮기려면 `"gantry"` 를 그 구역 `scene` 으로 옮기면 됩니다.
- 현황 `02~06` 타일은 **실제 사진**을 씁니다: `public/zones/ZONE-A.jpg` … (`zone-map.json` 의 `image`, 잘림 위치는 `imagePosition`). 사진이 없으면 "사진 등록 필요 · public/zones/ZONE-X.jpg" 가 표시됩니다. 지금 들어 있는 5장은 **AI 생성 이미지**(Canva)이며 타일 오른쪽 위에 "AI 생성 이미지" 표시가 붙습니다 (`zone-map.json` 의 `imageKind: "ai"`). 실사 사진으로 바꾸면 `imageKind` 를 `"photo"` 로 바꾸거나 지우세요.
- 구역 화면 오른쪽: 하청사(가상 회사, 글자 로고) · `원청 조선사 ↔ 하청` · 계약 정보 · 일정표(완료/진행 중/예정/지연, 오늘 선). **예시 데이터 · 서버 미연동** — `src/settings/contracts.json` 에서 고칩니다. 지연 = 오늘보다 날짜가 지났는데 완료가 아닌 항목. 작업 상태(tasks.status)와 섞지 않습니다. 실존 회사명은 쓰지 않습니다.
- 3D 작업장은 **배치 예시**이며 실제 도면이 아닙니다. 구역 ↔ 시설 연결은 `src/settings/zone-map.json` 의 `scene` 값(blockYard·workshop·shipAft·gantry·shipFore·quay)으로 바꿀 수 있습니다. 시설 모양 자체는 `src/yard/YardMap.tsx` 의 `buildScene()` 에 있습니다.

## 2. API 주소·모드 설정

우선순위: **URL 파라미터 > 화면의 설정 패널 > `public/ovot-config.json`(빌드 후 `dist/ovot-config.json`) > 기본값**

| 방법 | 예시 |
|---|---|
| 설정 파일 | `ovot-config.json` 의 `apiBaseUrl`, `pollIntervalMs`, `mode` |
| URL | `http://localhost:5173/?api=http://192.168.0.10:8000` · `?mode=demo` |
| 화면 | 상단 오른쪽 톱니바퀴 → API 주소·조회 주기·모드 변경 (이 브라우저에만 저장) |

- **LIVE**(기본): 실제 API 만 사용합니다. 서버가 꺼져 있어도 샘플 데이터로 바꾸지 않고, 마지막으로 받은 데이터와 "최신 아님" 경고를 함께 보여줍니다.
- **DEMO**: 직접 선택했을 때만 동작합니다. 상단에 항상 `DEMO · 샘플 데이터` 가 표시됩니다. 데이터는 `src/demo/scenario.json`(CASE 대본 1~5 기반)이며, 처리 결과는 탭을 닫으면 사라집니다.

## 3. 사용하는 API (OVOT-Backend routers 기준, 경로·필드명 변경 없음)

| 화면 | 호출 |
|---|---|
| 연결 상태 | `GET /health`, `GET /health/db` (503 이면 DB 오류로 표시) |
| 작업·구역 | `GET /tasks`, `PATCH /tasks/{id}/status` `{status}` |
| 실시간 대화 | `GET /voice-records?limit=` |
| AI 분석 | `GET /events?limit=`, `PATCH /events/{id}/status` `{event_status: CONFIRMED|REJECTED}`, `GET /event-types`, `GET /speech-types` |
| 인계 | `GET /handoffs`, `POST /handoffs` `{task_id, from_zone_id, to_zone_id}`, `PATCH /handoffs/{id}/status` `{status}` |

갱신은 `pollIntervalMs` 간격의 주기 조회입니다 (서버에 WebSocket·SSE 가 없음). 실패가 이어지면 간격을 늘려(최대 60초) 재시도합니다.
서버 쓰기는 **성공 응답을 받은 뒤 재조회한 값으로만** 화면을 바꿉니다. 409(허용되지 않는 인계 전이)·404·422 는 그 항목 아래에 오류로 표시합니다.

### 구역 해석 규칙
- `events` 에는 `zone_id` 가 없으므로 **발화(voice_records.zone_id)** 와 **작업(tasks.zone_id)** 으로 구역을 찾습니다.
- 두 값이 다르면 `구역 불일치: 발화 A · 작업 B` 로 표시하고 **어느 쪽으로도 확정하지 않습니다** (두 구역 필터 모두에 노출).
- 둘 다 없으면 `구역 미지정` 으로 분류합니다.
- 발화의 `zone_id` 가 비어 있고 작업에서만 구역을 찾은 경우 `(작업 기준)` 으로 표시합니다.

## 4. 구역 매핑 · 디지털트윈

`src/settings/zone-map.json` (빌드에 포함) — 배포 폴더에 같은 이름의 `zone-map.json` 을 두면 그 파일이 우선합니다.

```json
{ "zone_id": "ZONE-A", "label": "작업구역 A", "description": "조립장",
  "shape": { "x": 40, "y": 330, "w": 450, "h": 270 }, "unityObject": "Zone_A" }
```

- `zone_id` 는 DB 의 `tasks.zone_id` / `voice_records.zone_id` 값과 **정확히 같아야** 합니다.
- 구역 목록 = 매핑 파일의 구역 + 데이터에만 있는 구역. 데이터가 없는 구역은 "작업 데이터 없음"으로 표시합니다.
- `shape` 는 Unity 연결 전 임시 구역도 좌표입니다. Unity 연동은 `docs/UNITY_INTEGRATION.md` 를 보세요.

## 5. 폴더 구조

```
src/
  api/http.ts, api/ovotApi.ts     OVOT-Backend 호출 (에러 형식 {error,status_code,message} 해석)
  data/source.ts                   LiveSource (실시간 푸시 도입 시 이 계층만 교체)
  data/useOvotData.ts              주기 조회·순번 비교(늦게 온 응답 무시)·재시도
  data/model.ts                    구역 해석·구역 요약 계산
  demo/                            DEMO 전용 데이터 (scenario.json, codes.json)
  twin/                            디지털트윈: bridge.ts(규약), SchematicTwin(임시 구역도), UnityTwin(WebGL 로더)
  components/                      상단 바, 작업구역, 실시간 대화, AI 상황 요약, 설정
  settings/zone-map.json           구역·Unity 오브젝트 매핑
public/ovot-config.json            API 주소 등 런타임 설정 (DB 정보 넣지 말 것)
public/brand/                      ovot-web 의 실제 로고·파비콘 (원본 그대로 복사)
```

디자인 토큰(색·글꼴·버튼 모양)은 ovot-web 빌드 CSS 의 `:root` 값을 그대로 옮겼습니다. 관리자 화면은 정보 밀도를 위해 본문 글자 크기만 14px 로 낮췄습니다.
