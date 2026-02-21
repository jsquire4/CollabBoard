'use client'

import { useState, useEffect } from 'react'

// Module-level cache: storagePath → rendered canvas
const thumbnailCache = new Map<string, HTMLCanvasElement>()

/**
 * Renders the first page of a PDF to an offscreen HTMLCanvasElement.
 * Uses dynamic import to keep pdfjs-dist out of the main bundle.
 */
export function usePdfThumbnail(
  signedUrl: string | null,
  storagePath: string | null,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(() =>
    storagePath ? thumbnailCache.get(storagePath) ?? null : null,
  )

  useEffect(() => {
    if (!signedUrl || !storagePath) return

    // Return cached result immediately
    const cached = thumbnailCache.get(storagePath)
    if (cached) {
      setCanvas(cached)
      return
    }

    let cancelled = false

    async function render() {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

        const loadingTask = pdfjs.getDocument(signedUrl!)
        const pdf = await loadingTask.promise
        if (cancelled) return

        const page = await pdf.getPage(1)
        if (cancelled) return

        // Scale the page to fit within the requested width x height
        const viewport = page.getViewport({ scale: 1 })
        const scale = Math.min(width / viewport.width, height / viewport.height)
        const scaledViewport = page.getViewport({ scale })

        const offscreen = document.createElement('canvas')
        offscreen.width = Math.round(scaledViewport.width)
        offscreen.height = Math.round(scaledViewport.height)

        const ctx = offscreen.getContext('2d')
        if (!ctx || cancelled) return

        await page.render({ canvasContext: ctx, viewport: scaledViewport, canvas: offscreen }).promise
        if (cancelled) return

        thumbnailCache.set(storagePath!, offscreen)
        setCanvas(offscreen)
      } catch {
        // PDF load/render failed — leave canvas as null (fallback placeholder)
      }
    }

    void render()

    return () => {
      cancelled = true
    }
  }, [signedUrl, storagePath, width, height])

  return canvas
}
