import { useRef, useState, useEffect } from 'react'

/**
 * Positions a flyout panel to the right of a trigger button,
 * with automatic vertical overflow correction.
 *
 * Returns refs for the wrapper container, the trigger button, and the panel,
 * plus the computed CSS position for the panel.
 *
 * `posReady` starts false and becomes true after the rAF fires, allowing
 * callers to apply `visibility: hidden` on the first frame to prevent jitter.
 */
export function useFlyoutPosition(isOpen: boolean): {
  containerRef: React.RefObject<HTMLDivElement | null>
  btnRef: React.RefObject<HTMLButtonElement | null>
  panelRef: React.RefObject<HTMLDivElement | null>
  panelPos: { top: number; left: number }
  posReady: boolean
} {
  const containerRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [posReady, setPosReady] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setPosReady(false)
      return
    }
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const top = rect.top
    const left = rect.right + 8
    setPanelPos({ top, left })
    const rafId = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const panelRect = panel.getBoundingClientRect()
      let adjustedTop = top
      if (panelRect.bottom > window.innerHeight - 8) {
        adjustedTop = Math.max(8, window.innerHeight - panelRect.height - 8)
      }
      setPanelPos({ top: adjustedTop, left })
      setPosReady(true)
    })
    return () => cancelAnimationFrame(rafId)
  }, [isOpen])

  return { containerRef, btnRef, panelRef, panelPos, posReady }
}
