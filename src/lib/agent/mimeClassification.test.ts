/**
 * Tests for mimeClassification utilities.
 */
import { describe, it, expect } from 'vitest'
import { mimeTypeLabel, mimeTypeBadgeClass, mimeTypeBadgeColor } from './mimeClassification'

// ── mimeTypeLabel ─────────────────────────────────────────────────────────────

describe('mimeTypeLabel', () => {
  it('returns FILE for null', () => {
    expect(mimeTypeLabel(null)).toBe('FILE')
  })

  it('returns FILE for undefined', () => {
    expect(mimeTypeLabel(undefined)).toBe('FILE')
  })

  it('returns IMG for image/png', () => {
    expect(mimeTypeLabel('image/png')).toBe('IMG')
  })

  it('returns IMG for image/jpeg', () => {
    expect(mimeTypeLabel('image/jpeg')).toBe('IMG')
  })

  it('returns PDF for application/pdf', () => {
    expect(mimeTypeLabel('application/pdf')).toBe('PDF')
  })

  it('returns CSV for text/csv', () => {
    expect(mimeTypeLabel('text/csv')).toBe('CSV')
  })

  it('returns MD for text/markdown', () => {
    expect(mimeTypeLabel('text/markdown')).toBe('MD')
  })

  it('returns TXT for text/plain', () => {
    expect(mimeTypeLabel('text/plain')).toBe('TXT')
  })

  it('returns FILE for unknown mime type', () => {
    expect(mimeTypeLabel('application/octet-stream')).toBe('FILE')
  })
})

// ── mimeTypeBadgeClass ────────────────────────────────────────────────────────

describe('mimeTypeBadgeClass', () => {
  it('returns default class for null', () => {
    expect(mimeTypeBadgeClass(null)).toBe('bg-slate-100 text-slate-600')
  })

  it('returns default class for undefined', () => {
    expect(mimeTypeBadgeClass(undefined)).toBe('bg-slate-100 text-slate-600')
  })

  it('returns emerald class for image types', () => {
    expect(mimeTypeBadgeClass('image/png')).toBe('bg-emerald-100 text-emerald-700')
  })

  it('returns red class for PDF', () => {
    expect(mimeTypeBadgeClass('application/pdf')).toBe('bg-red-100 text-red-700')
  })

  it('returns amber class for CSV', () => {
    expect(mimeTypeBadgeClass('text/csv')).toBe('bg-amber-100 text-amber-700')
  })

  it('returns default class for text/markdown (no specific mapping)', () => {
    // mimeTypeBadgeClass does not have a branch for text/markdown — falls to default
    expect(mimeTypeBadgeClass('text/markdown')).toBe('bg-slate-100 text-slate-600')
  })

  it('returns default class for unknown type', () => {
    expect(mimeTypeBadgeClass('application/octet-stream')).toBe('bg-slate-100 text-slate-600')
  })
})

// ── mimeTypeBadgeColor ────────────────────────────────────────────────────────

describe('mimeTypeBadgeColor', () => {
  it('returns grey for null', () => {
    expect(mimeTypeBadgeColor(null)).toBe('#94A3B8')
  })

  it('returns grey for undefined', () => {
    expect(mimeTypeBadgeColor(undefined)).toBe('#94A3B8')
  })

  it('returns green for image types', () => {
    expect(mimeTypeBadgeColor('image/jpeg')).toBe('#10B981')
  })

  it('returns red for PDF', () => {
    expect(mimeTypeBadgeColor('application/pdf')).toBe('#EF4444')
  })

  it('returns amber for CSV', () => {
    expect(mimeTypeBadgeColor('text/csv')).toBe('#F59E0B')
  })

  it('returns indigo for text/markdown', () => {
    expect(mimeTypeBadgeColor('text/markdown')).toBe('#6366F1')
  })

  it('returns grey for text/plain (no specific mapping)', () => {
    // mimeTypeBadgeColor does not have a branch for text/plain — falls to default
    expect(mimeTypeBadgeColor('text/plain')).toBe('#94A3B8')
  })

  it('returns grey for unknown type', () => {
    expect(mimeTypeBadgeColor('application/zip')).toBe('#94A3B8')
  })
})
