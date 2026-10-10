/**
 * Unity 연결 전 임시 구역도. zone-map.json 의 좌표로만 그린다.
 * 같은 TwinHandle 규약을 따르므로 UnityTwin 으로 교체해도 상위 화면은 바뀌지 않는다.
 */
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import type { ZoneMap } from '../config'
import { Icon } from '../components/ui'
import type { TwinHandle, TwinZoneState } from './bridge'

interface Props {
  zoneMap: ZoneMap
  zones: TwinZoneState[]
  selectedZoneId: string | null
  onSelectZone: (zoneId: string | null) => void
}

type VB = { x: number; y: number; w: number; h: number }

export const SchematicTwin = forwardRef<TwinHandle, Props>(function SchematicTwin({ zoneMap, zones, selectedZoneId, onSelectZone }, ref) {
  const home: VB = useMemo(() => {
    const [x, y, w, h] = zoneMap.viewBox
    return { x, y, w, h }
  }, [zoneMap.viewBox])
  const [vb, setVb] = useState<VB>(home)
  const drag = useRef<{ px: number; py: number; vb: VB; moved: boolean } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState(false)

  useImperativeHandle(ref, () => ({ selectZone: () => {}, applyState: () => {} }), [])

  const stateById = new Map(zones.map((z) => [z.zone_id, z]))
  const shaped = zoneMap.zones.filter((z) => z.shape)

  const zoom = (factor: number, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) => {
    setVb((v) => {
      const w = Math.min(Math.max(v.w * factor, home.w / 4), home.w * 1.5)
      const h = (w / v.w) * v.h
      return { x: cx - ((cx - v.x) * w) / v.w, y: cy - ((cy - v.y) * h) / v.h, w, h }
    })
  }

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    const cx = vb.x + ((e.clientX - r.left) / r.width) * vb.w
    const cy = vb.y + ((e.clientY - r.top) / r.height) * vb.h
    zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, cx, cy)
  }

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { px: e.clientX, py: e.clientY, vb, moved: false }
  }
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
    setVb({ ...d.vb, x: d.vb.x - (dx / r.width) * d.vb.w, y: d.vb.y - (dy / r.height) * d.vb.h })
  }
  const suppressClick = useRef(false)
  const onUp = () => {
    if (drag.current?.moved) {
      suppressClick.current = true
      window.setTimeout(() => (suppressClick.current = false), 0)
    }
    drag.current = null
    setDragging(false)
  }
  const pick = (zoneId: string | null) => {
    if (!suppressClick.current) onSelectZone(zoneId)
  }

  return (
    <>
      <svg
        ref={svgRef}
        className={dragging ? 'dragging' : undefined}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        role="group"
        aria-label="임시 구역도"
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#e8e8ed" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x={home.x - home.w} y={home.y - home.h} width={home.w * 3} height={home.h * 3} fill="url(#grid)" onClick={() => pick(null)} />
        {shaped.map((z) => {
          const s = z.shape!
          const st = stateById.get(z.zone_id)
          const selected = selectedZoneId === z.zone_id
          const cls = ['zone-shape', st?.status === 'nodata' || !st ? 'nodata' : '', selected ? 'selected' : '', selectedZoneId && !selected ? 'dim' : ''].join(' ')
          return (
            <g
              key={z.zone_id}
              className={cls}
              onClick={(e) => {
                e.stopPropagation()
                pick(selected ? null : z.zone_id)
              }}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${z.label} 선택`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectZone(selected ? null : z.zone_id)
                }
              }}
            >
              <rect className="body" x={s.x} y={s.y} width={s.w} height={s.h} rx={14} />
              <text className="z-title" x={s.x + 22} y={s.y + 42}>
                {z.label}
              </text>
              {z.description && (
                <text className="z-desc" x={s.x + 22} y={s.y + 72}>
                  {z.description}
                </text>
              )}
              <text className="z-meta" x={s.x + 22} y={s.y + s.h - 52}>
                {st?.task_headline ?? '작업 데이터 없음'}
              </text>
              {st && st.needs_confirmation > 0 ? (
                <>
                  <circle className="z-dot" cx={s.x + 28} cy={s.y + s.h - 28} r={6} />
                  <text className="z-warn" x={s.x + 42} y={s.y + s.h - 21}>
                    확인 필요 {st.needs_confirmation}
                  </text>
                </>
              ) : (
                <text className="z-meta" x={s.x + 22} y={s.y + s.h - 21}>
                  {st && st.status !== 'nodata' ? '확인 필요 없음' : ''}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="twin-ctrl">
        <button className="icon-btn" onClick={() => zoom(1 / 1.25)} aria-label="확대" title="확대">
          <Icon name="plus" />
        </button>
        <button className="icon-btn" onClick={() => zoom(1.25)} aria-label="축소" title="축소">
          <Icon name="minus" />
        </button>
        <button className="icon-btn" onClick={() => setVb(home)} aria-label="전체 보기" title="전체 보기">
          <Icon name="fit" />
        </button>
      </div>
    </>
  )
})
