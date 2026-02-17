import { useState, useEffect } from 'react'

interface ModifierKeys {
  shiftHeld: boolean
  ctrlHeld: boolean
}

export function useShiftKey(): boolean {
  const keys = useModifierKeys()
  return keys.shiftHeld
}

export function useModifierKeys(): ModifierKeys {
  const [shiftHeld, setShiftHeld] = useState(false)
  const [ctrlHeld, setCtrlHeld] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(true)
      if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false)
      if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  return { shiftHeld, ctrlHeld }
}
