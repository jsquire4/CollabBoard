'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { BoardObject } from '@/types/board'

interface ApiConfig {
  method: string
  url: string
  headers: Record<string, string>
  body: string
}

const DEFAULT_CONFIG: ApiConfig = {
  method: 'GET',
  url: '',
  headers: {},
  body: '',
}

function parseFormula(formula?: string | null): ApiConfig {
  if (!formula) return DEFAULT_CONFIG
  try {
    const parsed = JSON.parse(formula) as Partial<ApiConfig>
    return {
      method: parsed.method ?? DEFAULT_CONFIG.method,
      url: parsed.url ?? DEFAULT_CONFIG.url,
      headers: parsed.headers ?? DEFAULT_CONFIG.headers,
      body: parsed.body ?? DEFAULT_CONFIG.body,
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

function parseHeaders(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    if (key) result[key] = value
  }
  return result
}

interface ApiObjectOverlayProps {
  object: BoardObject
  boardId: string
  onConfigChange: (id: string, formula: string) => void
}

export function ApiObjectOverlay({ object, boardId, onConfigChange }: ApiObjectOverlayProps) {
  const { id, x, y, width, height, formula } = object

  const [config, setConfig] = useState<ApiConfig>(() => parseFormula(formula))
  const [headersText, setHeadersText] = useState('')
  const [showHeaders, setShowHeaders] = useState(false)
  const [showBody, setShowBody] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [responseStatus, setResponseStatus] = useState<number | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const headersTextRef = useRef(headersText)
  headersTextRef.current = headersText

  // Sync from external formula changes (e.g. undo, remote updates)
  useEffect(() => {
    const parsed = parseFormula(formula)
    setConfig(parsed)
    const text = Object.entries(parsed.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
    setHeadersText(text)
    headersTextRef.current = text
  }, [formula])

  const saveConfig = useCallback((newConfig: ApiConfig, newHeadersText?: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const finalConfig: ApiConfig = {
        ...newConfig,
        headers: parseHeaders(newHeadersText ?? headersTextRef.current),
      }
      onConfigChange(id, JSON.stringify(finalConfig))
    }, 300)
  }, [id, onConfigChange])

  const handleMethodChange = useCallback((method: string) => {
    const next = { ...config, method }
    setConfig(next)
    saveConfig(next)
  }, [config, saveConfig])

  const handleUrlChange = useCallback((url: string) => {
    const next = { ...config, url }
    setConfig(next)
    saveConfig(next)
  }, [config, saveConfig])

  const handleHeadersChange = useCallback((text: string) => {
    setHeadersText(text)
    saveConfig(config, text)
  }, [config, saveConfig])

  const handleBodyChange = useCallback((body: string) => {
    const next = { ...config, body }
    setConfig(next)
    saveConfig(next)
  }, [config, saveConfig])

  const handleRun = useCallback(async () => {
    if (!config.url) return
    setIsRunning(true)
    setRunError(null)
    setResponseStatus(null)

    const finalConfig: ApiConfig = {
      ...config,
      headers: parseHeaders(headersText),
    }

    try {
      const res = await fetch(`/api/proxy/${boardId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: finalConfig.url,
          method: finalConfig.method,
          headers: finalConfig.headers,
          body: finalConfig.body || undefined,
          writeBackObjectId: id,
        }),
      })

      const data = await res.json() as { status?: number; error?: string }
      if (!res.ok) {
        setRunError(data.error ?? `Request failed: ${res.status}`)
      } else {
        setResponseStatus(data.status ?? res.status)
      }
    } catch (err) {
      setRunError((err as Error).message || 'Request failed')
    } finally {
      setIsRunning(false)
    }
  }, [config, headersText, boardId, id])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(config.method)

  // Positioned in canvas coordinates — parent container handles pan/scale transform.
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: width,
        height: height,
        pointerEvents: 'none',
      }}
    >
      {/* Title bar */}
      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1" style={{ pointerEvents: 'none' }}>
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider select-none">API</span>
        {responseStatus != null && (
          <StatusBadge status={responseStatus} />
        )}
        {runError && (
          <span className="text-[9px] text-red-500 truncate max-w-[120px]" title={runError}>err</span>
        )}
      </div>

      {/* Method + URL row */}
      <div className="flex gap-1 px-2" style={{ pointerEvents: 'auto' }}>
        <select
          value={config.method}
          onChange={e => handleMethodChange(e.target.value)}
          className="w-[52px] rounded border border-slate-200 px-0.5 py-0.5 text-[10px] font-medium bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
          onMouseDown={e => e.stopPropagation()}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DEL</option>
        </select>
        <input
          type="text"
          value={config.url}
          onChange={e => handleUrlChange(e.target.value)}
          placeholder="https://..."
          className="flex-1 min-w-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
          onMouseDown={e => e.stopPropagation()}
        />
      </div>

      {/* Run button + toggle buttons row */}
      <div className="flex items-center gap-1 px-2 mt-1" style={{ pointerEvents: 'auto' }}>
        <button
          onClick={() => void handleRun()}
          disabled={isRunning || !config.url}
          className="rounded bg-indigo-500 text-white text-[9px] font-medium px-2 py-0.5 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          onMouseDown={e => e.stopPropagation()}
        >
          {isRunning ? '...' : 'Run'}
        </button>
        <button
          onClick={() => setShowHeaders(prev => !prev)}
          className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${showHeaders ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
          onMouseDown={e => e.stopPropagation()}
        >
          H
        </button>
        {hasBody && (
          <button
            onClick={() => setShowBody(prev => !prev)}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${showBody ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
            onMouseDown={e => e.stopPropagation()}
          >
            B
          </button>
        )}
      </div>

      {/* Collapsible headers */}
      {showHeaders && (
        <div className="px-2 mt-1" style={{ pointerEvents: 'auto' }}>
          <textarea
            value={headersText}
            onChange={e => handleHeadersChange(e.target.value)}
            rows={2}
            placeholder="Key: Value"
            className="w-full resize-none rounded border border-slate-200 px-1.5 py-0.5 text-[9px] font-mono bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
            onMouseDown={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Collapsible body */}
      {showBody && hasBody && (
        <div className="px-2 mt-1" style={{ pointerEvents: 'auto' }}>
          <textarea
            value={config.body}
            onChange={e => handleBodyChange(e.target.value)}
            rows={2}
            placeholder='{"key": "value"}'
            className="w-full resize-none rounded border border-slate-200 px-1.5 py-0.5 text-[9px] font-mono bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
            onMouseDown={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: number }) {
  const isOk = status >= 200 && status < 300
  const isClientErr = status >= 400 && status < 500
  const colorClass = isOk
    ? 'bg-emerald-100 text-emerald-700'
    : isClientErr
    ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700'

  return (
    <span className={`inline-flex items-center px-1 py-0 rounded text-[9px] font-mono font-medium ${colorClass}`}>
      {status}
    </span>
  )
}
