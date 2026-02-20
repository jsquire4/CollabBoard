import { useRef, useState, useEffect } from 'react'

/**
 * Positions a flyout panel to the right of a trigger button,
 * with automatic vertical overflow correction.
 *
 * Returns refs for the wrapper container, the trigger button, and the panel,
 * plus the computed CSS position for the panel.
 */
export function useFlyoutPosition(isOpen: boolean): {
  containerRef: React.RefObject<HTMLDivElement | null>
  btnRef: React.RefObject<HTMLButtonElement | null>
  panelRef: React.RefObject<HTMLDivElement | null>
  panelPos: { top: number; left: number }
} {
  const containerRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useEffect(() => {
    if (!isOpen || !btnRef.current) return
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
      if (adjustedTop !== top) setPanelPos({ top: adjustedTop, left })
    })
    return () => cancelAnimationFrame(rafId)
  }, [isOpen])

  return { containerRef, btnRef, panelRef, panelPos }
}
