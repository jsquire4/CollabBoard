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
  onBringToFront?: () => void
  onBringForward?: () => void
  onSendBackward?: () => void
  onSendToBack?: () => void
  onGroup?: () => void
  onUngroup?: () => void
  canGroup?: boolean
  canUngroup?: boolean
}

const itemStyle: React.CSSProperties = {
  padding: '8px 12px',
  cursor: 'pointer',
  fontSize: '14px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  borderRadius: '4px',
}

function MenuItem({
  onClick,
  label,
  shortcut,
  color,
  hoverBg = '#f5f5f5',
}: {
  onClick: () => void
  label: string
  shortcut?: string
  color?: string
  hoverBg?: string
}) {
  return (
    <div
      style={{ ...itemStyle, color }}
      onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={onClick}
    >
      {label}
      {shortcut && (
        <span style={{ marginLeft: 'auto', color: '#999', fontSize: '12px' }}>{shortcut}</span>
      )}
    </div>
  )
}

export function ContextMenu({
  position,
  onDelete,
  onDuplicate,
  onColorChange,
  onClose,
  colors,
  currentColor,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
  onGroup,
  onUngroup,
  canGroup,
  canUngroup,
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
  const menuHeight = 340
  const x = position.x + menuWidth > window.innerWidth ? position.x - menuWidth : position.x
  const y = position.y + menuHeight > window.innerHeight ? position.y - menuHeight : position.y

  const sectionLabel: React.CSSProperties = {
    fontSize: '12px',
    color: '#888',
    padding: '4px 12px 2px',
  }

  const divider = <div style={{ height: '1px', background: '#e5e5e5', margin: '4px 0' }} />

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
      <MenuItem onClick={() => { onDuplicate(); onClose() }} label="Duplicate" shortcut="Ctrl+D" />
      <MenuItem onClick={() => { onDelete(); onClose() }} label="Delete" shortcut="Del" color="#d32f2f" hoverBg="#fef2f2" />

      {/* Layer section */}
      {(onBringToFront || onSendToBack) && (
        <>
          {divider}
          <div style={sectionLabel}>Layer</div>
          {onBringToFront && <MenuItem onClick={() => { onBringToFront(); onClose() }} label="Bring to Front" />}
          {onBringForward && <MenuItem onClick={() => { onBringForward(); onClose() }} label="Bring Forward" />}
          {onSendBackward && <MenuItem onClick={() => { onSendBackward(); onClose() }} label="Send Backward" />}
          {onSendToBack && <MenuItem onClick={() => { onSendToBack(); onClose() }} label="Send to Back" />}
        </>
      )}

      {/* Group/Ungroup section */}
      {(canGroup || canUngroup) && (
        <>
          {divider}
          {canGroup && onGroup && (
            <MenuItem onClick={() => { onGroup(); onClose() }} label="Group" shortcut="Ctrl+G" />
          )}
          {canUngroup && onUngroup && (
            <MenuItem onClick={() => { onUngroup(); onClose() }} label="Ungroup" shortcut="Ctrl+Shift+G" />
          )}
        </>
      )}

      {divider}
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
