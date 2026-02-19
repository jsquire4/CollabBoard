'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'collabboard-ui-dark-mode'

/**
 * Shared dark mode hook. Reads from localStorage, falls back to system preference,
 * persists changes, and listens for system preference changes.
 */
export function useDarkMode(): [boolean, (value: boolean) => void] {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) return stored === 'true'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(dark))
  }, [dark])

  // Listen for system preference changes (only applies when no explicit preference)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(STORAGE_KEY) === null) {
        setDark(e.matches)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Listen for cross-tab storage changes
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setDark(e.newValue === 'true')
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const toggle = useCallback((value: boolean) => {
    setDark(value)
  }, [])

  return [dark, toggle]
}

/** Read-only variant for components that only need to observe dark mode (no toggle). */
export function useDarkModeValue(): boolean {
  const [dark] = useDarkMode()
  return dark
}
