'use client'

import { memo, useState, useEffect } from 'react'
import { Group, Rect, Text, Image as KonvaImage } from 'react-konva'
import type { ShapeProps } from './shapeUtils'
import { handleShapeTransformEnd, getOutlineProps } from './shapeUtils'
import { mimeTypeLabel, mimeTypeBadgeColor } from '@/lib/agent/mimeClassification'

const MAX_TEXT_LENGTH = 2000

function useSignedUrl(storagePath?: string | null) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!storagePath) return
    let cancelled = false
    fetch(`/api/files/signed-url?path=${encodeURIComponent(storagePath)}`)
      .then(r => r.json())
      .then((data: { signedUrl?: string }) => {
        if (!cancelled && data.signedUrl) {
          setUrl(data.signedUrl)
        }
      })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [storagePath])

  return url
}

function useLoadImage(src: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!src) return
    setImage(null)
    setFailed(false)
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setImage(img)
    img.onerror = () => setFailed(true)
    img.src = src
    return () => { img.onload = null; img.onerror = null; img.src = '' }
  }, [src])

  return { image, failed }
}

function useTextContent(storagePath?: string | null, mimeType?: string | null) {
  const [content, setContent] = useState<string | null>(null)

  useEffect(() => {
    if (!storagePath || !mimeType?.startsWith('text/')) return
    let cancelled = false
    fetch(`/api/files/signed-url?path=${encodeURIComponent(storagePath)}`)
      .then(r => r.json())
      .then(async (data: { signedUrl?: string }) => {
        if (cancelled || !data.signedUrl) return
        const res = await fetch(data.signedUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        if (!cancelled) {
          setContent(text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) + '\n...' : text)
        }
      })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [storagePath, mimeType])

  return content
}

interface FileShapeProps extends ShapeProps {}

export const FileShape = memo(function FileShape({
  object,
  onDragEnd,
  onDragMove,
  onDragStart,
  isSelected,
  onSelect,
  shapeRef,
  onTransformEnd,
  onContextMenu,
  editable = true,
  dragBoundFunc,
}: FileShapeProps) {
  const { id, x, y, width, height, rotation, mime_type, file_name, storage_path } = object
  const outline = getOutlineProps(object, isSelected)
  const isImage = mime_type?.startsWith('image/')
  const isText = mime_type?.startsWith('text/')

  // Image loading
  const signedUrl = useSignedUrl(isImage ? storage_path : null)
  const { image, failed: imageFailed } = useLoadImage(signedUrl)

  // Text content loading
  const textContent = useTextContent(isText ? storage_path : null, mime_type)

  const displayName = file_name || 'Untitled file'
  const label = mimeTypeLabel(mime_type)
  const badge = mimeTypeBadgeColor(mime_type)

  const PADDING = 8
  const BADGE_SIZE = 32
  const HEADER_HEIGHT = 20

  return (
    <Group
      id={id}
      x={x}
      y={y}
      rotation={rotation}
      draggable={editable}
      onClick={() => onSelect(id)}
      onTap={() => onSelect(id)}
      onDragStart={() => onDragStart?.(id)}
      onDragMove={e => onDragMove?.(id, e.target.x(), e.target.y())}
      onDragEnd={e => onDragEnd(id, e.target.x(), e.target.y())}
      onTransformEnd={e => handleShapeTransformEnd(e, object, onTransformEnd)}
      onContextMenu={e => {
        e.evt.preventDefault()
        onContextMenu(id, e.evt.clientX, e.evt.clientY)
      }}
      dragBoundFunc={dragBoundFunc}
      ref={node => shapeRef(id, node)}
    >
      {isImage ? (
        // Image rendering — resizable
        <>
          {image ? (
            <KonvaImage
              image={image}
              width={width}
              height={height}
            />
          ) : (
            // Loading / error placeholder
            <>
              <Rect
                width={width}
                height={height}
                fill="#F1F5F9"
                cornerRadius={4}
              />
              <Text
                width={width}
                height={height}
                text={imageFailed ? 'Failed to load image' : 'Loading...'}
                fontSize={11}
                fill="#94A3B8"
                align="center"
                verticalAlign="middle"
              />
            </>
          )}
          <Rect
            width={width}
            height={height}
            fill="transparent"
            stroke={outline.stroke ?? 'transparent'}
            strokeWidth={outline.strokeWidth ?? 0}
            {...(outline.dash ? { dash: outline.dash } : {})}
          />
        </>
      ) : isText ? (
        // Text file rendering
        <>
          <Rect
            width={width}
            height={height}
            fill="#FAFAF9"
            stroke={outline.stroke ?? '#CBD5E1'}
            strokeWidth={outline.strokeWidth ?? 1}
            cornerRadius={6}
            shadowBlur={isSelected ? 6 : 1}
            shadowColor="rgba(0,0,0,0.1)"
            {...(outline.dash ? { dash: outline.dash } : {})}
          />
          {/* Filename header */}
          <Rect
            width={width}
            height={HEADER_HEIGHT}
            fill="#F1F5F9"
            cornerRadius={[6, 6, 0, 0]}
          />
          <Text
            x={PADDING}
            y={2}
            width={width - PADDING * 2}
            height={HEADER_HEIGHT}
            text={displayName}
            fontSize={9}
            fontStyle="bold"
            fill="#475569"
            verticalAlign="middle"
            ellipsis
          />
          {/* Text content */}
          <Text
            x={PADDING}
            y={HEADER_HEIGHT + 4}
            width={width - PADDING * 2}
            height={height - HEADER_HEIGHT - PADDING}
            text={textContent ?? 'Loading...'}
            fontSize={10}
            fontFamily="monospace"
            fill="#334155"
            wrap="word"
            ellipsis
          />
        </>
      ) : (
        // Generic file rendering (PDF, etc.)
        <>
          <Rect
            width={width}
            height={height}
            fill="#F1F5F9"
            stroke={outline.stroke ?? '#CBD5E1'}
            strokeWidth={outline.strokeWidth ?? 1}
            cornerRadius={8}
            shadowBlur={isSelected ? 8 : 2}
            shadowColor="rgba(0,0,0,0.12)"
            {...(outline.dash ? { dash: outline.dash } : {})}
          />
          {/* File type badge */}
          <Rect
            x={PADDING}
            y={(height - BADGE_SIZE) / 2}
            width={BADGE_SIZE}
            height={BADGE_SIZE}
            fill={badge}
            cornerRadius={6}
          />
          <Text
            x={PADDING}
            y={(height - BADGE_SIZE) / 2}
            width={BADGE_SIZE}
            height={BADGE_SIZE}
            text={label}
            fontSize={9}
            fontStyle="bold"
            fill="white"
            align="center"
            verticalAlign="middle"
          />
          {/* File name */}
          <Text
            x={PADDING + BADGE_SIZE + 8}
            y={PADDING}
            width={width - PADDING * 2 - BADGE_SIZE - 8}
            height={height - PADDING * 2}
            text={displayName}
            fontSize={11}
            fill="#334155"
            verticalAlign="middle"
            wrap="word"
            ellipsis
          />
        </>
      )}
    </Group>
  )
})
