import { useId } from 'react'

// 오봇 캐릭터 — 그림 파일 없이 SVG 로 그린다. 흰 광택 몸통 · 남색 얼굴 화면 · 빛나는 눈 · 파란 고리 귀
// mood: idle = 눈 깜박이고 손 흔들기, think = 답을 만드는 중(눈이 좌우로 움직임)
export function Ovot({ size = 64, mood = 'idle', wave = false }: { size?: number; mood?: 'idle' | 'think'; wave?: boolean }) {
  const id = useId().replace(/:/g, '')
  const g = (n: string) => `url(#${id}${n})`
  return (
    <svg className={`ovot ovot-${mood}${wave ? ' ovot-wave' : ''}`} width={size} height={size * 1.05} viewBox="0 0 200 210" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}shell`} cx="38%" cy="28%" r="80%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#eef1ff" />
          <stop offset="1" stopColor="#bccbfa" />
        </radialGradient>
        <linearGradient id={`${id}visor`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#1e2752" />
          <stop offset="1" stopColor="#0a0f2b" />
        </linearGradient>
        <radialGradient id={`${id}pod`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#2a3566" />
          <stop offset="1" stopColor="#0b1030" />
        </radialGradient>
        <filter id={`${id}glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`${id}soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      <ellipse cx="100" cy="201" rx="52" ry="6" fill="#5b7cf0" opacity="0.18" filter={g('soft')} />
      <g className="ovot-bob">
        {/* 귀 지느러미 (머리 뒤) */}
        <ellipse cx="46" cy="28" rx="11" ry="30" transform="rotate(-10 46 28)" fill={g('shell')} stroke="#c6d1f7" strokeWidth="1.2" />
        <ellipse cx="154" cy="28" rx="11" ry="30" transform="rotate(10 154 28)" fill={g('shell')} stroke="#c6d1f7" strokeWidth="1.2" />

        {/* 발 · 몸통 */}
        <ellipse cx="82" cy="190" rx="16" ry="10" fill={g('shell')} />
        <ellipse cx="118" cy="190" rx="16" ry="10" fill={g('shell')} />
        <rect x="48" y="106" width="104" height="88" rx="48" fill={g('shell')} stroke="#c6d1f7" strokeWidth="1.2" />
        <path d="M50 150 Q100 162 150 150" fill="none" stroke="#b9c6f3" strokeWidth="1.6" />
        <path d="M58 180 Q100 189 142 180" fill="none" stroke="#c4cff5" strokeWidth="1.4" />
        <ellipse cx="100" cy="114" rx="34" ry="6" fill="#8ea4ee" opacity="0.35" filter={g('soft')} />

        {/* 팔 — 왼팔은 들어 손 흔들기 */}
        <g transform="translate(146 128) rotate(-56)">
          <rect x="-11" y="0" width="22" height="42" rx="11" fill={g('shell')} stroke="#c6d1f7" strokeWidth="1.2" />
        </g>
        <g transform="translate(54 126)">
          <g className="ovot-arm">
            <rect x="-11" y="-44" width="22" height="46" rx="11" fill={g('shell')} stroke="#c6d1f7" strokeWidth="1.2" transform="rotate(-24)" />
          </g>
        </g>

        {/* 머리 */}
        <rect x="36" y="18" width="128" height="102" rx="48" fill={g('shell')} stroke="#c6d1f7" strokeWidth="1.2" />
        <ellipse cx="78" cy="34" rx="26" ry="8" fill="#ffffff" opacity="0.9" />

        {/* 귀 장치 — 파란 고리 */}
        <circle cx="37" cy="72" r="13" fill={g('pod')} />
        <circle cx="163" cy="72" r="13" fill={g('pod')} />
        <circle className="ovot-ring" cx="163" cy="72" r="9" fill="none" stroke="#4d8bff" strokeWidth="2.6" filter={g('glow')} />
        <circle className="ovot-ring" cx="37" cy="72" r="9" fill="none" stroke="#4d8bff" strokeWidth="2" opacity="0.6" filter={g('glow')} />

        {/* 얼굴 화면 */}
        <rect x="56" y="40" width="88" height="64" rx="24" fill={g('visor')} />
        <path d="M66 48 Q90 42 118 46" fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="5" strokeLinecap="round" />
        <g filter={g('glow')} fill="#dce9ff">
          <g className="ovot-eyes">
            <ellipse cx="82" cy="69" rx="7.5" ry="9.5" />
            <ellipse cx="118" cy="69" rx="7.5" ry="9.5" />
          </g>
          <path className="ovot-mouth" d="M92 86 Q100 93 108 86" fill="none" stroke="#dce9ff" strokeWidth="3.6" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  )
}
