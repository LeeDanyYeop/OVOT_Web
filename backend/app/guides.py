"""Approved work guides per assignment (demo data).

These are the only facts the quick answers use, and the grounding the AI answer must
stay inside. In production they would come from the MES / work-instruction system.
"""

GUIDES: dict[str, dict] = {
    "3번 블록 용접": {
        "process": "FCAW 맞대기 용접 (두께 25mm)",
        "current_step": 3,
        "steps": [
            "개선면 청소·가접 상태 확인",
            "예열 100℃ 확인",
            "1층 루트 패스 용접",
            "슬래그 제거 후 2·3층 적층",
            "외관 검사 요청 (QC)",
        ],
        "step_notes": {
            4: ["층간 슬래그를 와이어 브러시로 완전히 제거한 뒤 진행하세요", "층간 온도는 250℃ 이하로 유지하세요"],
        },
        "tools": [
            "FCAW 용접기 · 와이어 1.2mm",
            "슬래그 해머 · 와이어 브러시",
            "예열 토치 · 접촉식 온도계",
            "보호구: 용접면, 가죽장갑, 방염복, 안전화",
        ],
        "cautions": [
            "화기작업 허가서가 발행됐는지 먼저 확인하세요",
            "주변 3m 안의 가연물을 치우고 소화기를 비치하세요",
            "밀폐 구역이면 환기 후 산소·가스 농도를 측정하세요",
            "2m 이상 고소 작업이면 안전대를 체결하세요",
        ],
        "facts": [
            "부품 방향은 도면의 방향 표시(▲ 선수 방향)와 부품 기준면(Datum A, 'A' 각인)을 먼저 맞춘다",
            "기준면 A는 블록 하단 스킨 플레이트 쪽이며 그림에 표시되어 있다",
            "개선 각도는 V형 50°, 루트 간격 6mm이다",
            "와이어는 E71T-1C 1.2mm, 전류 220~260A가 기준이다",
        ],
        "figure": {"url": "/guides/block3-datum.svg", "caption": "기준면(Datum A)과 도면 방향 표시"},
        "references": ["용접 절차서 WPS-0312 (FCAW 맞대기)", "화기작업 안전지침 S-07", "3번 블록 조립도 DWG-B3-021"],
        "owner": "이준호 반장 (용접1팀)",
    },
    "A구역 용접 작업 감독": {
        "process": "A구역 용접 작업 감독",
        "current_step": 2,
        "steps": ["작업 전 TBM 진행", "화기작업 허가 확인", "작업 중 순회 점검", "작업 종료 후 화재 감시 30분"],
        "tools": ["무전기", "가스 측정기", "점검표"],
        "cautions": ["화재 감시자 배치 확인", "용접 케이블 손상 여부 확인"],
        "facts": [],
        "figure": None,
        "references": ["화기작업 안전지침 S-07"],
        "owner": "최서연 안전관리자 (안전관리팀)",
    },
    "B-12 블록 조립": {
        "process": "B-12 블록 조립",
        "current_step": 2,
        "steps": ["부재 반입·수량 확인", "기준선 마킹", "부재 취부·가접", "치수 검사"],
        "tools": ["레벨기", "줄자 · 직각자", "C-클램프", "가접용 용접기"],
        "cautions": ["크레인 인양 반경 안으로 들어가지 마세요", "신호수와 무전으로 소통하세요"],
        "facts": ["기준선은 도면의 FR(프레임) 번호 기준으로 마킹한다"],
        "figure": None,
        "references": ["블록 조립 표준 ASM-12", "중량물 인양 지침 S-03"],
        "owner": "이준호 반장 (용접1팀)",
    },
    "검사장 안전 점검": {
        "process": "C구역 검사장 안전 점검",
        "current_step": 1,
        "steps": ["방사선 투과검사 구역 통제 확인", "보호구 착용 점검", "점검 결과 기록"],
        "tools": ["점검표", "선량계"],
        "cautions": ["RT 촬영 중에는 통제선 안으로 들어가지 마세요"],
        "facts": [],
        "figure": None,
        "references": ["방사선 안전관리 규정 R-01"],
        "owner": "최서연 안전관리자 (안전관리팀)",
    },
}


# Previous shift's work log per zone (demo data). In production this comes from the
# work-log / MES records of the day before; today's real records are added on top.
HANDOVER: dict[str, dict] = {
    "ZONE-A": {
        "log": [
            {"time": "08:10", "who": "김민수", "text": "개선면 청소·가접 상태 확인 완료"},
            {"time": "09:30", "who": "김민수", "text": "예열 100℃ 확인 (접촉식 온도계)"},
            {"time": "10:20", "who": "김민수", "text": "1층 루트 패스 용접 시작 — 선수 쪽부터"},
            {"time": "14:50", "who": "이준호", "text": "가접부 1곳 미세 균열 발견 → 그라인딩 후 재가접"},
            {"time": "16:40", "who": "김민수", "text": "루트 패스 약 60% 진행, 선미 쪽 1.2m 남음"},
        ],
        "progress": "1층 루트 패스 약 60% 진행 (선미 쪽 1.2m 남음)",
        "open_issues": [
            "재가접한 부위는 루트 패스 전에 육안으로 다시 확인",
            "용접기 2번 와이어 송급 불량 — 정비 요청해 둠, 1번 사용",
        ],
    },
}


def handover_for(zone_id: str | None) -> dict | None:
    return HANDOVER.get(zone_id or "")

def guide_for(title: str | None) -> dict | None:
    return GUIDES.get(title or "")


def quick_answer(guide: dict, kind: str) -> dict:
    """Card answers built only from the approved guide (no AI)."""
    def ieyo(word: str) -> str:
        # 이에요 after a final consonant (받침), 예요 otherwise
        ch = word.rstrip(" )’'\"")[-1:]
        has_final = "가" <= ch <= "힣" and (ord(ch) - 0xAC00) % 28 != 0
        return f"{word}이에요" if has_final else f"{word}예요"

    steps = guide["steps"]
    cur = guide["current_step"]
    if kind == "next":
        nxt = cur + 1
        if nxt > len(steps):
            return {
                "headline": "마지막 단계예요. 완료되면 담당자에게 알려주세요.",
                "details": [f"현재 {cur}/{len(steps)}단계: {steps[cur - 1]}"],
                "show_figure": False,
            }
        return {
            "headline": f"다음 순서는 {ieyo('‘' + steps[nxt - 1] + '’')}.",
            "details": [f"지금은 {cur}/{len(steps)}단계: {steps[cur - 1]}", *guide.get("step_notes", {}).get(nxt, [])],
            "show_figure": False,
        }
    if kind == "tools":
        return {"headline": "이 작업에 필요한 준비물이에요.", "details": guide["tools"], "show_figure": False}
    # cautions
    return {"headline": guide["cautions"][0], "details": guide["cautions"][1:], "show_figure": False}
