import { useRef, useEffect } from 'react'

/** Keep a ref synchronized with a value. Replaces the useRef + useEffect boilerplate. */
export function useSyncRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value)
  useEffect(() => { ref.current = value }, [value])
  return ref
}
