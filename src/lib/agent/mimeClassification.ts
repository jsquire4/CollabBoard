/**
 * Shared MIME type classification utilities.
 * Used by FileLibraryPanel and ContextObjectShape to render consistent labels.
 */

/**
 * Short label for a MIME type (e.g. "IMG", "PDF", "CSV").
 */
export function mimeTypeLabel(mimeType?: string | null): string {
  if (!mimeType) return 'FILE'
  if (mimeType.startsWith('image/')) return 'IMG'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'text/csv') return 'CSV'
  if (mimeType === 'text/markdown') return 'MD'
  if (mimeType === 'text/plain') return 'TXT'
  return 'FILE'
}

/**
 * Tailwind bg + text classes for a MIME type badge.
 */
export function mimeTypeBadgeClass(mimeType?: string | null): string {
  if (!mimeType) return 'bg-slate-100 text-slate-600'
  if (mimeType.startsWith('image/')) return 'bg-emerald-100 text-emerald-700'
  if (mimeType === 'application/pdf') return 'bg-red-100 text-red-700'
  if (mimeType === 'text/csv') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

/**
 * Hex color for a MIME type indicator (used by Konva canvas shapes).
 */
export function mimeTypeBadgeColor(mimeType?: string | null): string {
  if (!mimeType) return '#94A3B8'
  if (mimeType.startsWith('image/')) return '#10B981'
  if (mimeType === 'application/pdf') return '#EF4444'
  if (mimeType === 'text/csv') return '#F59E0B'
  if (mimeType === 'text/markdown') return '#6366F1'
  return '#94A3B8'
}
