/**
 * Unity WebGL 빌드 로더. ovot-config.json 의 unity.enabled=true 이고 빌드 경로가 있을 때만 사용된다.
 * 현재 저장소에는 Unity 빌드가 없으므로 실제 동작은 검증되지 않았다.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { UnityConfig, ZoneMap } from '../config'
import type { Task } from '../types'
import { unityObjectForZone, zoneForUnityObject, type TwinHandle, type TwinStatePayload } from './bridge'

interface UnityInstance {
  SendMessage(objectName: string, method: string, arg?: string | number): void
  Quit(): Promise<void>
}
declare global {
  interface Window {
    createUnityInstance?: (canvas: HTMLCanvasElement, config: Record<string, unknown>, onProgress?: (p: number) => void) => Promise<UnityInstance>
    OVOTTwin?: { onObjectClicked: (objectName: string) => void }
  }
}

interface Props {
  unity: UnityConfig
  zoneMap: ZoneMap
  tasks: Task[]
  onSelectZone: (zoneId: string | null) => void
  onMessage: (msg: string) => void
  onFailed: (reason: string) => void
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-unity-loader="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.dataset.unityLoader = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Unity 로더를 불러오지 못했습니다: ${src}`))
    document.head.appendChild(s)
  })
}

export const UnityTwin = forwardRef<TwinHandle, Props>(function UnityTwin({ unity, zoneMap, tasks, onSelectZone, onMessage, onFailed }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const instance = useRef<UnityInstance | null>(null)
  const [progress, setProgress] = useState(0)
  const latest = useRef({ zoneMap, tasks, onSelectZone, onMessage })
  latest.current = { zoneMap, tasks, onSelectZone, onMessage }

  const send = (method: string, payload: unknown) => {
    try {
      instance.current?.SendMessage(unity.bridgeObject, method, JSON.stringify(payload))
    } catch (e) {
      onMessage(`Unity 메시지 전송 실패: ${String(e)}`)
    }
  }

  useImperativeHandle(ref, () => ({
    selectZone: (zoneId) => send('SelectZone', { zone_id: zoneId, unity_object: unityObjectForZone(latest.current.zoneMap, zoneId) }),
    applyState: (state: TwinStatePayload) => send('ApplyState', state),
  }))

  useEffect(() => {
    let cancelled = false
    const handleObject = (object: string) => {
      const r = zoneForUnityObject(latest.current.zoneMap, latest.current.tasks, object)
      if (r.zoneId) latest.current.onSelectZone(r.zoneId)
      else latest.current.onMessage(r.reason)
    }
    window.OVOTTwin = { onObjectClicked: handleObject }
    const onPost = (e: MessageEvent) => {
      if (e.data && e.data.type === 'ovot-twin:object-click' && typeof e.data.object === 'string') handleObject(e.data.object)
    }
    window.addEventListener('message', onPost)

    ;(async () => {
      try {
        if (!unity.loaderUrl || !unity.dataUrl || !unity.frameworkUrl || !unity.codeUrl) throw new Error('Unity 빌드 경로(loaderUrl/dataUrl/frameworkUrl/codeUrl)가 설정되지 않았습니다.')
        await loadScript(unity.loaderUrl)
        if (!window.createUnityInstance || !canvasRef.current) throw new Error('createUnityInstance 를 찾을 수 없습니다.')
        const inst = await window.createUnityInstance(canvasRef.current, { dataUrl: unity.dataUrl, frameworkUrl: unity.frameworkUrl, codeUrl: unity.codeUrl }, (p) => !cancelled && setProgress(p))
        if (cancelled) {
          inst.Quit()
          return
        }
        instance.current = inst
      } catch (e) {
        if (!cancelled) onFailed(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => {
      cancelled = true
      window.removeEventListener('message', onPost)
      delete window.OVOTTwin
      instance.current?.Quit().catch(() => {})
      instance.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unity.loaderUrl, unity.dataUrl, unity.frameworkUrl, unity.codeUrl])

  return (
    <>
      <canvas ref={canvasRef} id="unity-canvas" tabIndex={-1} />
      {!instance.current && progress < 1 && <div className="twin-overlay">Unity 디지털트윈 불러오는 중 · {Math.round(progress * 100)}%</div>}
    </>
  )
})
