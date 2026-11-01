// FR-12 조선소 목록과 로그인 화면의 조선소 위치 지도.
// 조선소 목록·위치는 시연용이며 실제 목록은 별도 확정 필요.

type Dock = { id: string; name: string; note: string; blocks: string[] }
export type Shipyard = {
  id: string; name: string; lon: number; lat: number; live: boolean; docks: Dock[]
  label: 'left' | 'right' | 'below'
  /** 로그인 지도 사진(public/brand/login-map.webp — NASA Black Marble 2016 한반도 중간밝기(2배), 경도 120.5~133E·위도 31~40.5N, 가로 ×0.81 보정) 위 위치 % */
  px: number; py: number
}

export const SHIPYARDS: Shipyard[] = [
  {
    id: 'ulsan', name: 'HD현대중공업 울산 야드', lon: 129.441, lat: 35.519, live: true, label: 'right', px: 70.9, py: 51.6, // lon·lat: 위성 사진의 도크 위치
    docks: [
      { id: '도크1', name: '도크1', note: '드라이 도크 · 선박 블록 탑재 중', blocks: ['B-01', 'B-02', 'B-03', 'B-04'] },
      { id: '도크2', name: '도크2', note: '지상 건조장', blocks: [] },
    ],
  },
  {
    id: 'mipo', name: 'HD현대미포 울산 야드', lon: 129.44, lat: 35.47, live: false, label: 'right', px: 72.0, py: 54.1,
    docks: [],
  },
  {
    id: 'yeongam', name: 'HD현대삼호 영암 야드', lon: 126.45, lat: 34.75, live: false, label: 'left', px: 47.6, py: 60.5,
    docks: [],
  },
  {
    id: 'gunsan', name: 'HD현대중공업 군산조선소', lon: 126.53, lat: 35.94, live: false, label: 'left', px: 49.0, py: 47.7,
    docks: [],
  },
]

// 로그인 전에 고른 조선소·도크 (이 브라우저 탭 동안 기억)
const SITE_KEY = 'ovot-site'
export function loadSite(): { yard: Shipyard; dock: string } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(SITE_KEY) || 'null') as { yard: string; dock: string } | null
    const yard = v && SHIPYARDS.find((y) => y.id === v.yard)
    return yard ? { yard, dock: v!.dock } : null
  } catch { return null }
}
export const saveSite = (yard: string, dock: string) => { try { sessionStorage.setItem(SITE_KEY, JSON.stringify({ yard, dock })) } catch { /* 저장 안 돼도 진행 */ } }
export const clearSite = () => { try { sessionStorage.removeItem(SITE_KEY) } catch { /* 무시 */ } }

// 로그인 화면 왼쪽 — 밤의 한반도 위성 사진 위에 HD현대 조선소 위치 아이콘. 관제가 연결된 곳(울산)은 빨갛게 강조
// 위치 표시 — 밤 지도에 어울리는 빛나는 점(비컨). 가운데 점 + 흰 테두리 + 은은한 빛. 관제 연결(울산)은 빨강 점에 퍼지는 물결
function YardIcon({ live }: { live: boolean }) {
  return <b className={`cn-beacon${live ? ' is-live' : ''}`} aria-hidden="true"><i /></b>
}

export function KoreaMap({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="cn-korea">
      <div className="cn-korea-box">
        <img src={`${import.meta.env.BASE_URL}brand/login-map.webp`} alt="밤의 한반도 위성 사진 (NASA Black Marble)" />
        {SHIPYARDS.map((y) => (
          <button key={y.id} type="button" aria-pressed={selected === y.id} aria-label={`${y.name} 선택`} onClick={() => onSelect(y.id)}
            className={`cn-korea-pin is-${y.label}${y.live ? ' is-live' : ''}${selected === y.id ? ' is-on' : ''}`} style={{ left: `${y.px}%`, top: `${y.py}%` }}>
            {y.live && <i className="cn-korea-pulse" />}
            <YardIcon live={y.live} />
            <span>{y.name.replace(' 야드', '')}</span>
          </button>
        ))}
      </div>
      <p className="cn-korea-credit">이미지: NASA Earth Observatory · Black Marble 2016</p>
    </div>
  )
}
