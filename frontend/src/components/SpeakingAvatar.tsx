import { useEffect, useRef, useState } from 'react'
import { audioContext } from '../lib/audio'

interface Props {
  stream: MediaStream | null
  photo: string
  name: string
}

const BAR_FACTORS = [0.55, 1, 0.75, 0.4]

/** Worker photo whose ring and speech-bubble bars follow the live microphone level. */
export function SpeakingAvatar({ stream, photo, name }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [photoOk, setPhotoOk] = useState(true)

  useEffect(() => {
    const root = rootRef.current
    const ctx = audioContext()
    if (!root || !stream || !ctx) {
      root?.classList.add('no-meter')
      return
    }
    void ctx.resume().catch(() => undefined)
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    let level = 0

    const tick = () => {
      if (ctx.state !== 'running') {
        // No meter data (context still locked): fall back to a gentle idle animation.
        root.classList.add('no-meter')
      } else {
        root.classList.remove('no-meter')
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buf.length)
        level = level * 0.55 + Math.min(1, rms * 6) * 0.45
        root.style.setProperty('--lvl', level.toFixed(3))
        root.classList.toggle('is-speaking', level > 0.08)
      }
    }
    // A timer instead of requestAnimationFrame keeps the meter alive even when the page
    // isn't painting frames; ~16 updates per second is smooth enough for a level meter.
    const timer = window.setInterval(tick, 60)
    return () => {
      window.clearInterval(timer)
      source.disconnect()
    }
  }, [stream])

  return (
    <div className="speaker" ref={rootRef} role="img" aria-label={`${name} 음성 스트리밍 중`}>
      <span className="speaker-ring" aria-hidden="true" />
      {photoOk ? (
        <img className="speaker-photo" src={photo} alt="" onError={() => setPhotoOk(false)} />
      ) : (
        <span className="speaker-photo speaker-initial" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
      )}
      <span className="speaker-badge" aria-hidden="true">
        {BAR_FACTORS.map((f, i) => (
          <i key={i} style={{ ['--f' as string]: f, animationDelay: `${i * 0.12}s` }} />
        ))}
      </span>
    </div>
  )
}
