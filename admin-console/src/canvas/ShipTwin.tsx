/**
 * 캔버스 화면 가운데의 임시 선박 평면도.
 * 실제 도면·3D 모델이 아니라 zone-map.json 의 segment 값으로 구역을 나눠 그린 배치 예시다.
 * Unity WebGL 이 설정되면 CanvasTwin 이 이 컴포넌트 대신 UnityTwin 을 보여준다.
 */
import { forwardRef, useImperativeHandle, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import type { ZoneMap } from '../config'
import type { TwinHandle, TwinZoneState } from '../twin/bridge'

interface Props {
  zoneMap: ZoneMap
  zones: TwinZoneState[]
  selectedZoneId: string | null
  onSelectZone: (zoneId: string | null) => void
}

export interface ShipTwinHandle extends TwinHandle {
  zoomIn(): void
  zoomOut(): void
  reset(): void
}

type VB = { x: number; y: number; w: number; h: number }
const HOME: VB = { x: 90, y: 80, w: 1050, h: 500 }
const HULL = 'M150 230 L860 222 C990 226 1070 268 1100 310 C1070 352 990 394 860 398 L150 390 C134 362 130 258 150 230 Z'
const CARD_W = 214
const CARD_H = 76

export const ShipTwin = forwardRef<ShipTwinHandle, Props>(function ShipTwin({ zoneMap, zones, selectedZoneId, onSelectZone }, ref) {
  const [vb, setVb] = useState<VB>(HOME)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ px: number; py: number; vb: VB; moved: boolean } | null>(null)
  const suppress = useRef(false)
  const [dragging, setDragging] = useState(false)

  const zoom = (factor: number, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) =>
    setVb((v) => {
      const w = Math.min(Math.max(v.w * factor, HOME.w / 4), HOME.w * 1.6)
      const h = (w / v.w) * v.h
      return { x: cx - ((cx - v.x) * w) / v.w, y: cy - ((cy - v.y) * h) / v.h, w, h }
    })

  useImperativeHandle(ref, () => ({
    selectZone: () => {},
    applyState: () => {},
    zoomIn: () => zoom(1 / 1.25),
    zoomOut: () => zoom(1.25),
    reset: () => setVb(HOME),
  }))

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, vb.x + ((e.clientX - r.left) / r.width) * vb.w, vb.y + ((e.clientY - r.top) / r.height) * vb.h)
  }
  const onDown = (e: PointerEvent<SVGSVGElement>) => (drag.current = { px: e.clientX, py: e.clientY, vb, moved: false })
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    const svg = svgRef.current
    if (!d || !svg) return
    const dx = e.clientX - d.px
    const dy = e.clientY - d.py
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) {
      d.moved = true
      setDragging(true)
      svg.setPointerCapture(e.pointerId)
    }
    const r = svg.getBoundingClientRect()
    const scale = Math.max(d.vb.w / r.width, d.vb.h / r.height)
    setVb({ ...d.vb, x: d.vb.x - dx * scale, y: d.vb.y - dy * scale })
  }
  const onUp = () => {
    if (drag.current?.moved) {
      suppress.current = true
      window.setTimeout(() => (suppress.current = false), 0)
    }
    drag.current = null
    setDragging(false)
  }
  const pick = (z: string | null) => {
    if (!suppress.current) onSelectZone(z)
  }

  const stateById = new Map(zones.map((z) => [z.zone_id, z]))
  const segs = zoneMap.zones.filter((z) => z.segment)

  return (
    <svg
      ref={svgRef}
      className={`ship${dragging ? ' dragging' : ''}`}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      role="group"
      aria-label="선박 구역 평면도 (배치 예시)"
    >
      <defs>
        <clipPath id="hull-clip">
          <path d={HULL} />
        </clipPath>
      </defs>
      <rect x={-2000} y={-2000} width={5200} height={5200} fill="transparent" onClick={() => pick(null)} />

      {/* 선체 */}
      <path d={HULL} className="hull-shadow" transform="translate(0 10)" />
      <path d={HULL} className="hull" />
      <g clipPath="url(#hull-clip)">
        {segs.map((z) => {
          const st = stateById.get(z.zone_id)
          const sel = selectedZoneId === z.zone_id
          const cls = ['seg', st?.status ?? 'nodata', sel ? 'selected' : '', selectedZoneId && !sel ? 'dim' : ''].join(' ')
          return (
            <rect
              key={z.zone_id}
              className={cls}
              x={z.segment!.from}
              y={200}
              width={z.segment!.to - z.segment!.from}
              height={220}
              onClick={(e) => {
                e.stopPropagation()
                pick(sel ? null : z.zone_id)
              }}
            />
          )
        })}
        {segs.slice(1).map((z) => (
          <line key={z.zone_id} className="seg-line" x1={z.segment!.from} x2={z.segment!.from} y1={200} y2={420} />
        ))}
        <line className="centerline" x1={150} x2={1090} y1={310} y2={310} />
      </g>
      <path d={HULL} className="hull-outline" />
      <rect className="deckhouse" x={172} y={268} width={62} height={84} rx={8} />

      {/* 구역 상태 점 + 라벨 카드 */}
      {segs.map((z, i) => {
        const st = stateById.get(z.zone_id)
        const sel = selectedZoneId === z.zone_id
        const cx = (z.segment!.from + z.segment!.to) / 2
        const above = i % 2 === 0
        const cardY = above ? 112 : 432
        const cardX = Math.min(Math.max(cx - CARD_W / 2, 100), 1130 - CARD_W)
        const lineY1 = above ? cardY + CARD_H : cardY
        const status = st?.status ?? 'nodata'
        const activate = () => pick(sel ? null : z.zone_id)
        return (
          <g
            key={z.zone_id}
            className={`pin ${status}${sel ? ' selected' : ''}${selectedZoneId && !sel ? ' dim' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              activate()
            }}
            role="button"
            tabIndex={0}
            aria-pressed={sel}
            aria-label={`${z.label} 선택`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelectZone(sel ? null : z.zone_id)
              }
            }}
          >
            <line className="pin-line" x1={cx} x2={cx} y1={lineY1} y2={310} />
            <circle className="pin-dot" cx={cx} cy={310} r={9} />
            <rect className="pin-card" x={cardX} y={cardY} width={CARD_W} height={CARD_H} rx={16} />
            <text className="pin-title" x={cardX + 16} y={cardY + 28}>
              {z.label}
              {z.description && <tspan className="pin-desc"> {z.description}</tspan>}
            </text>
            <text className={status === 'attention' ? 'pin-warn' : 'pin-meta'} x={cardX + 16} y={cardY + 54}>
              {status === 'attention' ? `확인 필요 ${st!.needs_confirmation} · ${st!.task_headline}` : st?.task_headline ?? '작업 데이터 없음'}
            </text>
          </g>
        )
      })}
      <text className="ship-dir" x={150} y={560}>선미</text>
      <text className="ship-dir" x={1100} y={560} textAnchor="end">선수</text>
    </svg>
  )
})
