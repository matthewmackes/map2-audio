import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import './XTermTerminal.css'

export type SshAuth = 'publickey' | 'password'

export interface XTermConnection {
  host: string
  port?: number
  username: string
  auth: SshAuth
  password?: string
  privateKey?: string
  knownHosts?: 'accept-new' | 'strict' | 'auto-add'
  keepaliveS?: number
  connectTimeoutS?: number
  idleTimeoutS?: number
  env?: Record<string, string>
}

export type XTermStatus =
  | { type: 'connecting' }
  | { type: 'open'; sessionId: string }
  | { type: 'closed'; reason?: string }
  | { type: 'error'; code: string; message: string }

interface XTermTerminalProps {
  connection: XTermConnection
  onStatusChange?: (status: XTermStatus) => void
  onClose?: () => void
  wsPath?: string
}

function buildWsUrl(path: string): string {
  if (typeof window === 'undefined') return path
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}

export function XTermTerminal({
  connection,
  onStatusChange,
  onClose,
  wsPath = '/ws/ssh',
}: XTermTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<XTermStatus>({ type: 'connecting' })

  useEffect(() => {
    if (!hostRef.current) return
    // Resolve the platform mono token at mount time. xterm.js reads its
    // own fontFamily option directly and cannot read CSS variables, so
    // we pull the computed --font-mono off the document root and fall
    // back to the same Plex / Menlo / Consolas chain if it is unset.
    const rootStyle =
      typeof window !== 'undefined' ? window.getComputedStyle(document.documentElement) : null
    const fontFamily =
      (rootStyle?.getPropertyValue('--font-mono').trim() || '') ||
      '"IBM Plex Mono", "Menlo", "Consolas", monospace'
    const term = new Terminal({
      fontFamily,
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
      theme: {
        background: '#161616',
        foreground: '#f4f4f4',
        cursor: '#78a9ff',
        selectionBackground: '#393939',
      },
    })
    const fit = new FitAddon()
    const links = new WebLinksAddon()
    term.loadAddon(fit)
    term.loadAddon(links)
    term.open(hostRef.current)
    try {
      fit.fit()
    } catch {
      // element not sized yet; resize observer will retry
    }
    termRef.current = term
    fitRef.current = fit

    const ws = new WebSocket(buildWsUrl(wsPath))
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    const sendJson = (obj: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
    }

    const pushStatus = (s: XTermStatus) => {
      setStatus(s)
      onStatusChange?.(s)
    }

    ws.onopen = () => {
      const dim = fit.proposeDimensions()
      const cols = dim?.cols ?? term.cols ?? 80
      const rows = dim?.rows ?? term.rows ?? 24
      sendJson({
        type: 'open',
        host: connection.host,
        port: connection.port ?? 22,
        username: connection.username,
        auth: connection.auth,
        password: connection.password,
        private_key: connection.privateKey,
        known_hosts: connection.knownHosts ?? 'accept-new',
        keepalive_s: connection.keepaliveS ?? 30,
        connect_timeout_s: connection.connectTimeoutS ?? 10,
        idle_timeout_s: connection.idleTimeoutS ?? 900,
        term_type: 'xterm-256color',
        term_cols: cols,
        term_rows: rows,
        env: connection.env,
      })
    }

    ws.onmessage = (evt) => {
      if (typeof evt.data === 'string') {
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(evt.data)
        } catch {
          return
        }
        const t = msg.type
        if (t === 'open_ok') {
          pushStatus({ type: 'open', sessionId: String(msg.session_id ?? '') })
        } else if (t === 'open_error' || t === 'error') {
          const err = (msg.error ?? {}) as { code?: string; message?: string }
          pushStatus({
            type: 'error',
            code: String(err.code ?? 'unknown'),
            message: String(err.message ?? 'connection error'),
          })
          try {
            term.writeln(`\r\n\x1b[31m[${err.code ?? 'error'}] ${err.message ?? ''}\x1b[0m`)
          } catch {
            // terminal disposed
          }
        } else if (t === 'closed') {
          pushStatus({ type: 'closed', reason: msg.reason ? String(msg.reason) : undefined })
        }
      } else if (evt.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(evt.data))
      }
    }

    ws.onerror = () => {
      pushStatus({ type: 'error', code: 'ws_error', message: 'WebSocket transport error' })
    }

    ws.onclose = () => {
      pushStatus({ type: 'closed' })
      onClose?.()
    }

    const disposeData = term.onData((data) => {
      sendJson({ type: 'data', data })
    })

    const doResize = () => {
      if (!fitRef.current || !termRef.current) return
      try {
        fitRef.current.fit()
      } catch {
        return
      }
      const cols = termRef.current.cols
      const rows = termRef.current.rows
      sendJson({ type: 'resize', cols, rows })
    }

    const ro = new ResizeObserver(() => {
      doResize()
    })
    ro.observe(hostRef.current)

    return () => {
      disposeData.dispose()
      ro.disconnect()
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'close' }))
      } catch {
        // ignore
      }
      try {
        ws.close()
      } catch {
        // ignore
      }
      wsRef.current = null
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [
    connection.host,
    connection.port,
    connection.username,
    connection.auth,
    connection.password,
    connection.privateKey,
    connection.knownHosts,
    connection.keepaliveS,
    connection.connectTimeoutS,
    connection.idleTimeoutS,
    connection.env,
    onClose,
    onStatusChange,
    wsPath,
  ])

  return (
    <div className="map2-xterm">
      <div className="map2-xterm__surface" ref={hostRef} />
      {status.type !== 'open' && (
        <div
          className={`map2-xterm__overlay map2-xterm__overlay--${status.type}`}
          role="status"
          aria-live="polite"
        >
          {status.type === 'connecting' && `Connecting to ${connection.host}…`}
          {status.type === 'error' && `[${status.code}] ${status.message}`}
          {status.type === 'closed' && (status.reason ?? 'Session closed')}
        </div>
      )}
    </div>
  )
}

export default XTermTerminal
