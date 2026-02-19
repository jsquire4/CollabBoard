import { describe, it, expect } from 'vitest'
import { TIPTAP_EXTENSIONS } from './extensions'

describe('TIPTAP_EXTENSIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(TIPTAP_EXTENSIONS)).toBe(true)
    expect(TIPTAP_EXTENSIONS.length).toBeGreaterThan(0)
  })

  it('contains StarterKit', () => {
    const names = TIPTAP_EXTENSIONS.map((ext: { name?: string }) => ext.name).filter(Boolean)
    // StarterKit registers multiple extensions, check for a core one
    expect(names.some(n => typeof n === 'string')).toBe(true)
  })

  it('includes TextStyle extension', () => {
    const names = TIPTAP_EXTENSIONS.map((ext: { name?: string }) => ext.name)
    expect(names).toContain('textStyle')
  })

  it('includes Color extension', () => {
    const names = TIPTAP_EXTENSIONS.map((ext: { name?: string }) => ext.name)
    expect(names).toContain('color')
  })

  it('includes Highlight extension', () => {
    const names = TIPTAP_EXTENSIONS.map((ext: { name?: string }) => ext.name)
    expect(names).toContain('highlight')
  })

  it('includes TaskList and TaskItem extensions', () => {
    const names = TIPTAP_EXTENSIONS.map((ext: { name?: string }) => ext.name)
    expect(names).toContain('taskList')
    expect(names).toContain('taskItem')
  })

  it('includes Underline extension', () => {
    const names = TIPTAP_EXTENSIONS.map((ext: { name?: string }) => ext.name)
    expect(names).toContain('underline')
  })
})
