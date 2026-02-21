'use client'

import { useState, useEffect, useCallback } from 'react'

export interface ApiObjectPanelProps {
  objectId: string
  boardId: string
  formula?: string | null
  isOpen: boolean
  onClose: () => void
  onSave: (formula: string) => void
}

interface ApiConfig {
  method: string
  url: string
  headers: Record<string, string>
  body: string
}

interface ApiResponse {
  status: number
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

function StatusBadge({ status }: { status: number }) {
  const isOk = status >= 200 && status < 300
  const isClientErr = status >= 400 && status < 500
  const colorClass = isOk
    ? 'bg-emerald-100 text-emerald-700'
    : isClientErr
    ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${colorClass}`}>
      {status}
    </span>
  )
}

export function ApiObjectPanel({
  objectId,
  boardId,
  formula,
  isOpen,
  onClose,
  onSave,
}: ApiObjectPanelProps) {
  const [config, setConfig] = useState<ApiConfig>(DEFAULT_CONFIG)
  const [headersText, setHeadersText] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [response, setResponse] = useState<ApiResponse | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  // Parse formula on open
  useEffect(() => {
    if (!isOpen) return
    const parsed = parseFormula(formula)
    setConfig(parsed)
    // Convert headers object to text
    setHeadersText(
      Object.entries(parsed.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n'),
    )
    setResponse(null)
    setRunError(null)
  }, [isOpen, formula])

  const parseHeaders = useCallback((text: string): Record<string, string> => {
    const result: Record<string, string> = {}
    for (const line of text.split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()
      if (key) result[key] = value
    }
    return result
  }, [])

  const handleSave = useCallback(() => {
    const finalConfig: ApiConfig = {
      ...config,
      headers: parseHeaders(headersText),
    }
    onSave(JSON.stringify(finalConfig))
  }, [config, headersText, parseHeaders, onSave])

  const handleRun = useCallback(async () => {
    if (!config.url) return
    setIsRunning(true)
    setRunError(null)
    setResponse(null)

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
          writeBackObjectId: objectId,
        }),
      })

      const data = await res.json() as ApiResponse & { error?: string }
      if (!res.ok) {
        setRunError(data.error ?? `Request failed: ${res.status}`)
      } else {
        setResponse(data)
      }
    } catch (err) {
      setRunError((err as Error).message || 'Request failed')
    } finally {
      setIsRunning(false)
    }
  }, [config, headersText, boardId, objectId, parseHeaders])

  if (!isOpen) return null

  return (
    <div
      className="fixed z-50 w-96 rounded-xl bg-white shadow-xl border border-slate-200 flex flex-col overflow-hidden"
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', maxHeight: '80vh' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
        <span className="text-sm font-semibold text-slate-700">API Configuration</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Form */}
      <div className="p-4 space-y-3 overflow-y-auto flex-1">
        {/* Method + URL row */}
        <div className="flex gap-2">
          <select
            value={config.method}
            onChange={e => setConfig(prev => ({ ...prev, method: e.target.value }))}
            className="w-24 rounded border border-slate-200 px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input
            type="text"
            value={config.url}
            onChange={e => setConfig(prev => ({ ...prev, url: e.target.value }))}
            placeholder="https://api.example.com/endpoint"
            className="flex-1 rounded border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>

        {/* Headers */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Headers <span className="font-normal text-slate-400">(Key: Value, one per line)</span>
          </label>
          <textarea
            value={headersText}
            onChange={e => setHeadersText(e.target.value)}
            rows={2}
            placeholder="Content-Type: application/json"
            className="w-full resize-none rounded border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>

        {/* Body (for POST/PUT/PATCH) */}
        {['POST', 'PUT', 'PATCH'].includes(config.method) && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Request Body</label>
            <textarea
              value={config.body}
              onChange={e => setConfig(prev => ({ ...prev, body: e.target.value }))}
              rows={3}
              placeholder='{"key": "value"}'
              className="w-full resize-none rounded border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        )}

        {/* Response */}
        {runError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
            {runError}
          </div>
        )}
        {response && (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-medium text-slate-600">Response</span>
              <StatusBadge status={response.status} />
            </div>
            <pre className="p-3 text-xs font-mono overflow-x-auto max-h-32 overflow-y-auto text-slate-700">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(response.body), null, 2)
                } catch {
                  return response.body
                }
              })()}
            </pre>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 flex justify-end gap-2 shrink-0">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Save
        </button>
        <button
          onClick={() => void handleRun()}
          disabled={isRunning || !config.url}
          className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isRunning ? 'Running…' : 'Run'}
        </button>
      </div>
    </div>
  )
}
