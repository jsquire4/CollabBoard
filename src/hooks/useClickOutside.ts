'use client'

import { useEffect, RefObject } from 'react'

/**
 * Calls the callback when a mousedown occurs outside the given ref element.
 * Useful for closing popovers, dropdowns, and modals.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  isActive: boolean,
  onOutsideClick: () => void
) {
  useEffect(() => {
    if (!isActive) return

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutsideClick()
      }
    }

    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [ref, isActive, onOutsideClick])
}
