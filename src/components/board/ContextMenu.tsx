'use client'

import { useEffect, useRef } from 'react'

interface ContextMenuProps {
  position: { x: number; y: number }
  onDelete: () => void
  onDuplicate: () => void
  onColorChange: (color: string) => void
  onClose: () => void
  colors: string[]
  currentColor?: string
}

export function ContextMenu({
  position,
  onDelete,
  onDuplicate,
  onColorChange,
  onClose,
  colors,
  currentColor,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid immediate close from the right-click event
    requestAnimationFrame(() => {
      window.addEventListener('mousedown', handleClickOutside)
    })
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Adjust position to keep menu on screen
  const menuWidth = 200
  const menuHeight = 140
  const x = position.x + menuWidth > window.innerWidth ? position.x - menuWidth : position.x
  const y = position.y + menuHeight > window.innerHeight ? position.y - menuHeight : position.y

  const itemStyle: React.CSSProperties = {
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderRadius: '4px',
  }

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: y,
        left: x,
        background: '#fff',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        padding: '4px',
        zIndex: 200,
        minWidth: '180px',
      }}
    >
      <div
        style={itemStyle}
        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        onClick={() => { onDuplicate(); onClose() }}
      >
        Duplicate
        <span style={{ marginLeft: 'auto', color: '#999', fontSize: '12px' }}>Ctrl+D</span>
      </div>
      <div
        style={{ ...itemStyle, color: '#d32f2f' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        onClick={() => { onDelete(); onClose() }}
      >
        Delete
        <span style={{ marginLeft: 'auto', color: '#999', fontSize: '12px' }}>Del</span>
      </div>
      <div style={{ height: '1px', background: '#e5e5e5', margin: '4px 0' }} />
      <div style={{ padding: '8px 12px' }}>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>Color</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {colors.map(color => (
            <button
              key={color}
              onClick={() => { onColorChange(color); onClose() }}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: color,
                border: color === currentColor ? '2px solid #333' : '2px solid transparent',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
