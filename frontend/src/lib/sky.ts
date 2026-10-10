import { useEffect, useState } from 'react'

/** Sky colors over the day: [hour, top, bottom]. Neighbouring stops are blended. */
const STOPS: [number, string, string][] = [
  [0, '#0b1026', '#1c2652'],
  [4.5, '#121a3d', '#2c3164'],
  [5.5, '#2b3d7c', '#e6a0a4'],
  [6.5, '#79ade6', '#ffd4ac'],
  [8, '#9fd0ff', '#eaf5ff'],
  [12, '#7ec5ff', '#f3f9ff'],
  [15, '#8cc4f4', '#fff0da'],
  [17, '#7aa2e0', '#ffc993'],
  [18.3, '#4b5aa3', '#f28b5f'],
  [19.3, '#232f66', '#6a4f8e'],
  [21, '#101633', '#232c58'],
  [24, '#0b1026', '#1c2652'],
]

// Light text on the sky outside roughly 6:20–17:50.
const DAY_START = 6.35
const DAY_END = 17.85

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: string, b: string, t: number): string {
  const x = hex(a)
  const y = hex(b)
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

export interface Sky {
  hour: number
  top: string
  bottom: string
  night: boolean
  /** Sun (day) or moon (night) glow position in % of the screen. */
  glowX: number
  glowY: number
  glow: string
}

export function skyAt(hour: number): Sky {
  const h = ((hour % 24) + 24) % 24
  let i = 0
  while (i < STOPS.length - 2 && STOPS[i + 1][0] <= h) i++
  const [h0, t0, b0] = STOPS[i]
  const [h1, t1, b1] = STOPS[i + 1]
  const t = (h - h0) / (h1 - h0)
  const night = h < DAY_START || h >= DAY_END

  // Sun arc from 5:30 to 19:00; the moon sits high on the right at night.
  const sunT = (h - 5.5) / 13.5
  const sunUp = sunT > 0 && sunT < 1
  const glowX = sunUp ? 8 + sunT * 84 : 78
  const glowY = sunUp ? 78 - Math.sin(Math.PI * sunT) * 66 : 16
  const lowSun = sunUp && (sunT < 0.15 || sunT > 0.85)
  const glow = !sunUp
    ? 'rgba(225, 232, 255, 0.22)'
    : lowSun
      ? 'rgba(255, 196, 140, 0.65)'
      : 'rgba(255, 248, 225, 0.75)'

  return { hour: h, top: mix(t0, t1, t), bottom: mix(b0, b1, t), night, glowX, glowY, glow }
}

/** Current local hour as a fraction (e.g. 18.5). `?sky=18.5` overrides it for demos. */
function currentHour(): number {
  const forced = new URLSearchParams(window.location.search).get('sky')
  if (forced !== null && forced !== '' && !Number.isNaN(Number(forced))) return Number(forced)
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}

export function useSky(): Sky {
  const [sky, setSky] = useState(() => skyAt(currentHour()))
  useEffect(() => {
    const timer = window.setInterval(() => setSky(skyAt(currentHour())), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return sky
}

const CHEERS: [number, string[]][] = [
  [4, ['이른 시간부터 고생 많으십니다. 오늘도 안전이 먼저예요.', '새벽 공기가 차요. 몸 풀고 천천히 시작해요.']],
  [6, ['좋은 아침입니다! 오늘 하루도 안전하게 시작해요.', '상쾌한 아침이에요. 보호구 착용부터 챙겨요.', '오늘도 무사히, 함께 시작해요.']],
  [9, ['오전 작업 힘내세요! 안전 수칙 한 번 더 확인해요.', '집중하는 오전, 주변도 함께 살펴요.', '좋은 흐름이에요. 오늘도 차근차근!']],
  [12, ['점심 맛있게 드시고 충분히 쉬세요.', '든든하게 드시고 오후도 힘내요.']],
  [13, ['나른한 오후, 물 한 잔 마시고 천천히 가요.', '오후도 안전하게! 잠깐 스트레칭 어때요?', '절반 넘게 왔어요. 조금만 더 힘내요.']],
  [16, ['마무리까지 조금만 더! 끝까지 안전하게.', '오늘도 정말 수고 많으셨어요. 마지막까지 화이팅!']],
  [18, ['오늘 하루도 수고 많으셨습니다. 안전하게 마무리해요.', '고생하셨어요. 정리 정돈까지 안전하게!']],
  [21, ['야간 작업 고생 많으십니다. 주변을 한 번 더 살펴요.', '밤이 깊었어요. 피곤할수록 천천히, 안전하게.']],
]

/** Short encouragement for the worker, by time of day; varies day to day. */
export function cheerFor(hour: number, date = new Date()): string {
  const h = ((hour % 24) + 24) % 24
  let pool = CHEERS[CHEERS.length - 1][1] // 21:00–04:00 wraps to the night set
  for (const [start, lines] of CHEERS) if (h >= start) pool = lines
  if (h < CHEERS[0][0]) pool = CHEERS[CHEERS.length - 1][1]
  const day = Math.floor(date.getTime() / 86_400_000)
  return pool[day % pool.length]
}
