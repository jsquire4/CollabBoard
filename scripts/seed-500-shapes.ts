/**
 * Seed a board with 500 rectangle shapes for load/performance testing.
 *
 * Usage:
 *   npx tsx scripts/seed-500-shapes.ts <boardId>
 *
 * Create a board in the app first, then run with its ID. Requires
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 *
 * For E2E: create a share link in the app, then set TEST_BOARD_JOIN_TOKEN
 * to the token from the share URL (/board/join/<token>).
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

const COUNT = 500

async function main() {
  const boardId = process.argv[2]
  if (!boardId) {
    console.error('Usage: npx tsx scripts/seed-500-shapes.ts <boardId>')
    process.exit(1)
  }

  const { data } = await supabase.from('boards').select('id').eq('id', boardId).single()
  if (!data) {
    console.error('Board not found:', boardId)
    process.exit(1)
  }

  const { count: existing } = await supabase
    .from('board_objects')
    .select('*', { count: 'exact', head: true })
    .eq('board_id', boardId)
  console.log(`Board ${boardId} has ${existing ?? 0} objects. Adding ${COUNT}...`)

  const objects = Array.from({ length: COUNT }, (_, i) => ({
    board_id: boardId,
    type: 'rectangle',
    x: (i % 25) * 80,
    y: Math.floor(i / 25) * 80,
    width: 60,
    height: 60,
    rotation: 0,
    text: '',
    color: '#FFEB3B',
    font_size: 14,
    z_index: (existing ?? 0) + i,
    parent_id: null,
  }))

  const BATCH = 100
  for (let i = 0; i < objects.length; i += BATCH) {
    const batch = objects.slice(i, i + BATCH)
    const { error } = await supabase.from('board_objects').insert(batch)
    if (error) {
      console.error('Insert error:', error)
      process.exit(1)
    }
    console.log(`Inserted ${i + batch.length}/${COUNT}`)
  }

  console.log('\nDone. Create a share link in the app, then set:')
  console.log('TEST_BOARD_JOIN_TOKEN=<token from /board/join/<token>>')
}

main()
