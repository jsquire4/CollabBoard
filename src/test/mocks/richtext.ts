import type { TipTapDoc } from '@/types/board'

export const EMPTY_DOC: TipTapDoc = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

export const SIMPLE_DOC: TipTapDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
  ],
}

export const BOLD_DOC: TipTapDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Bold text', marks: [{ type: 'bold' }] },
      ],
    },
  ],
}

export const MULTILINE_DOC: TipTapDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Line 1' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Line 2' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Line 3' }] },
  ],
}

export const CHECKLIST_DOC: TipTapDoc = {
  type: 'doc',
  content: [
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Todo 1' }] },
          ],
        },
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Done 1' }] },
          ],
        },
      ],
    },
  ],
}
