'use client'

import { useEffect, useRef as useReactRef, RefObject } from 'react'

/**
 * Calls the callback when a mousedown occurs outside the given ref element(s).
 * Useful for closing popovers, dropdowns, and modals.
 * Accepts a single ref or an array of refs — clicking outside ALL of them triggers the callback.
 *
 * Uses a ref for the callback to avoid re-registering the listener on every render
 * when callers pass inline arrow functions.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  isActive: boolean,
  onOutsideClick: () => void
) {
  const callbackRef = useReactRef(onOutsideClick)
  callbackRef.current = onOutsideClick

  useEffect(() => {
    if (!isActive) return

    const refs = Array.isArray(ref) ? ref : [ref]

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const clickedInside = refs.some(r => r.current?.contains(target))
      if (!clickedInside) {
        callbackRef.current()
      }
    }

    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [ref, isActive])
}
