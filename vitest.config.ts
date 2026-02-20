import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['src/**/*.stress.test.ts', 'node_modules', 'dist'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 78,
        branches: 65,
        functions: 75,
        lines: 80,
      },
      exclude: [
        'src/lib/supabase/client.ts',
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        // 100% imperative Konva/DOM — no testable pure logic
        'src/hooks/board/useRemoteCursors.ts',
        'src/hooks/board/useRightClickPan.ts',
        // NOTE: useStageInteractions.ts is intentionally NOT excluded despite
        // low coverage (~20%). Its pure helpers (findShapeIdFromNode, geometry)
        // are tested (19 tests), but the bulk of the file is imperative Konva
        // Stage event wiring (mouse/wheel/touch handlers) that requires a real
        // Konva Stage to exercise — same category as the two hooks above.
        // Phase 1 agent/slide stub components — no testable pure logic yet
        'src/components/board/AgentShape.tsx',
        'src/components/board/AgentChatPanel.tsx',
        'src/components/board/FilmstripPanel.tsx',
        'src/components/board/FileLibraryPanel.tsx',
        'src/components/board/CommentThread.tsx',
        'src/components/board/ApiObjectPanel.tsx',
      ],
    },
  },
})
