import { StarterKit } from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Underline } from '@tiptap/extension-underline'
import { TextAlign } from '@tiptap/extension-text-align'
import type { Extensions } from '@tiptap/react'

/**
 * Single source of truth for TipTap extensions.
 * Used by both the live editor and `generateHTML` for static rendering.
 */
export const TIPTAP_EXTENSIONS: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    underline: false,
  }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Underline,
  TextAlign.configure({
    types: ['heading', 'paragraph'],
    alignments: ['left', 'center', 'right'],
  }),
]
