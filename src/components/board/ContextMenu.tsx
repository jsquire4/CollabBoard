'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useBoardMutations } from '@/contexts/BoardMutationsContext'
import { useBoardContext } from '@/contexts/BoardContext'
import { isVectorType } from './shapeUtils'

interface ContextMenuProps {
  position: { x: number; y: number }
  objectId: string
  onClose: () => void
  recentColors?: string[]
}

// ─── Icon components (stroke-based inline SVGs) ───────────────────────────────

function IconEdit() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.25 2.25 0 1 1 3.182 3.182L7.5 19.213l-4 1 1-4 12.362-12.726z" />
    </svg>
  )
}

function IconCopy() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="8" y="8" width="12" height="12" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

function IconArrange() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="3" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="14" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="14" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconOrder() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="13" width="8" height="8" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="13" y="3" width="8" height="8" rx="1" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" fillOpacity={0.12} />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 13v6h-6M5 11V5h6" />
    </svg>
  )
}

function IconComment() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-4.5 5.25 3 3v-3H18a2.25 2.25 0 0 0 2.25-2.25V5.25A2.25 2.25 0 0 0 18 3H6a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 6 18h1.5z" />
    </svg>
  )
}

function IconLock() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="5" y="11" width="14" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function IconUnlock() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="5" y="11" width="14" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 0 1 7.93-.75" />
    </svg>
  )
}

function IconDelete() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg className="h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

// ─── Sub-option pill button ────────────────────────────────────────────────────

function SubButton({
  label,
  shortcut,
  onClick,
  disabled = false,
}: {
  label: string
  shortcut?: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors
        ${disabled
          ? 'opacity-40 cursor-not-allowed bg-charcoal/90 text-parchment dark:bg-[#1E293B]'
          : 'bg-charcoal/90 text-parchment hover:bg-navy dark:bg-[#1E293B] dark:hover:bg-navy/70 cursor-pointer'
        }`}
    >
      <span>{label}</span>
      {shortcut && (
        <span className="ml-auto pl-4 font-mono text-[10px] opacity-50">{shortcut}</span>
      )}
    </button>
  )
}

// ─── Circle button row (one row in the vertical strip) ────────────────────────

interface CtxButtonProps {
  id: string
  label: string
  icon: React.ReactNode
  hasSubmenu?: boolean
  danger?: boolean
  disabled?: boolean
  isOpen?: boolean
  onHoverEnter: (id: string) => void
  onHoverLeave: () => void
  onClick?: () => void
  children?: React.ReactNode
}

function CtxButton({
  id,
  label,
  icon,
  hasSubmenu = false,
  danger = false,
  disabled = false,
  isOpen = false,
  onHoverEnter,
  onHoverLeave,
  onClick,
  children,
}: CtxButtonProps) {
  return (
    <div
      className="relative"
      onMouseEnter={() => onHoverEnter(id)}
      onMouseLeave={onHoverLeave}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        title={label}
        className={`h-10 w-10 rounded-full flex items-center justify-center shadow-md transition-colors
          ${disabled
            ? 'opacity-40 cursor-not-allowed bg-charcoal/90 text-parchment dark:bg-[#1E293B]'
            : danger
              ? 'bg-charcoal/90 text-parchment hover:bg-red-700 dark:bg-[#1E293B] dark:hover:bg-red-700 cursor-pointer'
              : 'bg-charcoal/90 text-parchment hover:bg-navy dark:bg-[#1E293B] dark:hover:bg-navy/70 cursor-pointer'
          }`}
      >
        {icon}
        {hasSubmenu && (
          <span className="absolute -right-0.5 -bottom-0.5">
            <IconChevronRight />
          </span>
        )}
      </button>

      {/* Sub-option flyout — positioned absolutely to the right of this row */}
      {isOpen && children && (
        <div
          className="absolute flex flex-col gap-1 animate-[flyout-in]"
          style={{ top: 0, left: 'calc(100% + 8px)' }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ContextMenu({
  position,
  objectId,
  onClose,
  recentColors: _recentColors,
}: ContextMenuProps) {
  const {
    onDelete,
    onDuplicate,
    onCopy,
    onCut,
    onPaste,
    onBringToFront,
    onBringForward,
    onSendBackward,
    onSendToBack,
    onGroup,
    onUngroup,
    canGroup,
    canUngroup,
    onLock,
    onUnlock,
    canLock,
    canUnlock,
    onEditVertices,
    canEditVertices,
    onAddRow,
    onDeleteRow,
    onAddColumn,
    onDeleteColumn,
    onCommentOpen,
  } = useBoardMutations()

  const { objects, isObjectLocked, activeGroupId } = useBoardContext()

  const ctxObj = objects.get(objectId)
  const isLine = isVectorType(ctxObj?.type ?? '')
  const isTable = ctxObj?.type === 'table'
  const isDataConnector = ctxObj?.type === 'data_connector'
  const isLocked = isObjectLocked(objectId)

  // Resolve context target ID — if shape is in a group and not inside active group,
  // z-order operations apply to the top-level group ancestor
  const contextTargetId = useMemo(() => {
    const obj = objects.get(objectId)
    if (obj?.parent_id && !activeGroupId) {
      let current = obj
      while (current.parent_id) {
        const parent = objects.get(current.parent_id)
        if (!parent) break
        current = parent
      }
      return current.id
    }
    return objectId
  }, [objectId, objects, activeGroupId])

  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: position.x, y: position.y })
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Click-outside handler — closes menu on mousedown outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const rafId = requestAnimationFrame(() => {
      window.addEventListener('mousedown', handleClickOutside)
    })
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  // Clamp position so menu stays within viewport
  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let nx = position.x
    let ny = position.y
    if (nx + rect.width > vw) nx = Math.max(0, vw - rect.width - 8)
    if (ny + rect.height > vh) ny = Math.max(0, vh - rect.height - 8)
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.x, position.y])

  // Hover timer — 150 ms delay before opening sub-menu
  const handleHover = (id: string | null) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setOpenSubmenu(id), 150)
  }

  const handleHoverLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    // Don't close immediately — sub-menu content is inside the same div,
    // so onMouseLeave only fires when leaving the entire row + flyout.
    hoverTimer.current = setTimeout(() => setOpenSubmenu(null), 150)
  }

  // Derived display flags
  const showEdit = canEditVertices || isTable
  const showArrange = canGroup || canUngroup
  const showComment = !isLine && !isDataConnector
  const showLockButton = canLock || canUnlock || isLocked
  const showDelete = !isLocked

  return (
    <div
      ref={menuRef}
      className="flex flex-col gap-1 animate-[panel-in]"
      style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 200 }}
    >
      {/* ── Edit ›  (vertices / table operations) ─────────────────────────── */}
      {showEdit && (
        <CtxButton
          id="edit"
          label="Edit"
          icon={<IconEdit />}
          hasSubmenu
          isOpen={openSubmenu === 'edit'}
          onHoverEnter={handleHover}
          onHoverLeave={handleHoverLeave}
        >
          {canEditVertices && (
            <SubButton
              label="Edit Vertices"
              onClick={() => { onEditVertices(); onClose() }}
            />
          )}
          {isTable && (
            <>
              <SubButton label="Add Row"      onClick={() => { onAddRow();    onClose() }} />
              <SubButton label="Delete Row"   onClick={() => { onDeleteRow(); onClose() }} />
              <SubButton label="Add Column"   onClick={() => { onAddColumn();    onClose() }} />
              <SubButton label="Delete Column" onClick={() => { onDeleteColumn(); onClose() }} />
            </>
          )}
        </CtxButton>
      )}

      {/* ── Copy / Paste › ────────────────────────────────────────────────── */}
      <CtxButton
        id="copy"
        label="Copy / Paste"
        icon={<IconCopy />}
        hasSubmenu
        isOpen={openSubmenu === 'copy'}
        onHoverEnter={handleHover}
        onHoverLeave={handleHoverLeave}
      >
        <SubButton label="Copy"      shortcut="Ctrl+C" onClick={() => { onCopy();      onClose() }} />
        <SubButton label="Cut"       shortcut="Ctrl+X" onClick={() => { onCut();       onClose() }} />
        <SubButton label="Duplicate" shortcut="Ctrl+D" onClick={() => { onDuplicate(); onClose() }} />
        <SubButton label="Paste"     shortcut="Ctrl+V" onClick={() => { onPaste();     onClose() }} />
      </CtxButton>

      {/* ── Arrange › (group / ungroup) ───────────────────────────────────── */}
      {showArrange && (
        <CtxButton
          id="arrange"
          label="Arrange"
          icon={<IconArrange />}
          hasSubmenu
          isOpen={openSubmenu === 'arrange'}
          onHoverEnter={handleHover}
          onHoverLeave={handleHoverLeave}
        >
          {canGroup && (
            <SubButton label="Group"   shortcut="Ctrl+G"       onClick={() => { onGroup();   onClose() }} />
          )}
          {canUngroup && (
            <SubButton label="Ungroup" shortcut="Ctrl+Shift+G" onClick={() => { onUngroup(); onClose() }} />
          )}
        </CtxButton>
      )}

      {/* ── Order › (z-order, hide when locked) ──────────────────────────── */}
      {!isLocked && (
        <CtxButton
          id="order"
          label="Order"
          icon={<IconOrder />}
          hasSubmenu
          isOpen={openSubmenu === 'order'}
          onHoverEnter={handleHover}
          onHoverLeave={handleHoverLeave}
        >
          <SubButton
            label="Bring to Front"
            shortcut="Ctrl+Shift+]"
            onClick={() => { onBringToFront(contextTargetId); onClose() }}
          />
          <SubButton
            label="Forward"
            shortcut="Ctrl+]"
            onClick={() => { onBringForward(contextTargetId); onClose() }}
          />
          <SubButton
            label="Backward"
            shortcut="Ctrl+["
            onClick={() => { onSendBackward(contextTargetId); onClose() }}
          />
          <SubButton
            label="Send to Back"
            shortcut="Ctrl+Shift+["
            onClick={() => { onSendToBack(contextTargetId); onClose() }}
          />
        </CtxButton>
      )}

      {/* ── Comment (hide for lines and data connectors) ──────────────────── */}
      {showComment && (
        <CtxButton
          id="comment"
          label="Comment"
          icon={<IconComment />}
          isOpen={openSubmenu === 'comment'}
          onHoverEnter={handleHover}
          onHoverLeave={handleHoverLeave}
          onClick={() => { onCommentOpen?.(objectId); onClose() }}
        />
      )}

      {/* ── Lock / Unlock ─────────────────────────────────────────────────── */}
      {showLockButton && (
        <>
          {canLock && !isLocked && (
            <CtxButton
              id="lock"
              label="Lock"
              icon={<IconLock />}
              isOpen={openSubmenu === 'lock'}
              onHoverEnter={handleHover}
              onHoverLeave={handleHoverLeave}
              onClick={() => { onLock(); onClose() }}
            />
          )}
          {canUnlock && isLocked && (
            <CtxButton
              id="lock"
              label="Unlock"
              icon={<IconUnlock />}
              isOpen={openSubmenu === 'lock'}
              onHoverEnter={handleHover}
              onHoverLeave={handleHoverLeave}
              onClick={() => { onUnlock(); onClose() }}
            />
          )}
          {isLocked && !canUnlock && (
            <CtxButton
              id="lock"
              label="Locked (no permission)"
              icon={<IconLock />}
              disabled
              isOpen={false}
              onHoverEnter={handleHover}
              onHoverLeave={handleHoverLeave}
            />
          )}
        </>
      )}

      {/* ── Delete (danger, hide if locked) ──────────────────────────────── */}
      {showDelete && (
        <CtxButton
          id="delete"
          label="Delete"
          icon={<IconDelete />}
          danger
          isOpen={openSubmenu === 'delete'}
          onHoverEnter={handleHover}
          onHoverLeave={handleHoverLeave}
          onClick={() => { onDelete(); onClose() }}
        />
      )}
    </div>
  )
}
