import { useEffect, useRef, useState } from 'react'
import { tokenStore } from './api'
import type { HubMessage } from '../types'

export type HubStatus = 'connecting' | 'live' | 'offline'

/** Subscribes to /ws/location-events with auth-on-first-message, keepalive and reconnect. */
export function useEventHub(onMessage: (msg: HubMessage) => void): HubStatus {
  const [status, setStatus] = useState<HubStatus>('connecting')
  const handler = useRef(onMessage)
  handler.current = onMessage

  useEffect(() => {
    let ws: WebSocket | null = null
    let retry = 0
    let closed = false
    let pingTimer: number | undefined
    let retryTimer: number | undefined

    const connect = () => {
      setStatus('connecting')
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws/location-events`)
      ws.onopen = () => ws?.send(JSON.stringify({ type: 'auth', token: tokenStore.get() }))
      ws.onmessage = (ev) => {
        if (ev.data === 'pong') return
        let msg: HubMessage
        try {
          msg = JSON.parse(ev.data)
        } catch {
          return
        }
        if (msg.type === 'ready') {
          retry = 0
          setStatus('live')
          pingTimer = window.setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 25_000)
        }
        handler.current(msg)
      }
      ws.onclose = () => {
        window.clearInterval(pingTimer)
        if (closed) return
        setStatus('offline')
        const delay = Math.min(15_000, 1000 * 2 ** retry++)
        retryTimer = window.setTimeout(connect, delay)
      }
    }
    connect()

    return () => {
      closed = true
      window.clearInterval(pingTimer)
      window.clearTimeout(retryTimer)
      ws?.close()
    }
  }, [])

  return status
}
