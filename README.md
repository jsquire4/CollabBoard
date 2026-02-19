# CollabBoard

A real-time collaborative whiteboard built with Next.js, Supabase, and Konva. Designed for teams to create, share, and iterate on visual ideas together — with conflict-free editing even across unreliable connections.

## Architecture Highlights

### Conflict-Free Replication (CRDT)

CollabBoard implements **per-field Last-Writer-Wins registers** using **Hybrid Logical Clocks (HLC)** for deterministic conflict resolution. This isn't a library — it's a custom CRDT layer built from scratch in TypeScript.

**How it works:**

- Every board object field (`x`, `y`, `color`, `text`, `width`, etc.) carries its own HLC timestamp in a `field_clocks` JSONB column.
- When merging a remote update, each field is resolved independently — the higher clock wins. Concurrent edits to different fields (one user drags while another changes color) both survive automatically.
- HLCs preserve causal ordering: if event A happened before B, B's clock is always greater. For truly concurrent events, a deterministic node-ID tie-break ensures all clients converge to the same state.
- **Add-wins delete semantics**: Deletes use a `deleted_at` tombstone with its own clock. A delete only wins if its clock exceeds every field clock on the object. If someone edits after a delete, the update resurrects the object — no lost work.
- **Reconnect reconciliation**: On reconnect, local field clocks are compared against the database. Any local wins are pushed to a Supabase Edge Function for server-side merge, so offline edits are never dropped.

Enable with `NEXT_PUBLIC_CRDT_ENABLED=true`. The merge logic lives in `src/lib/crdt/` with 80+ unit tests covering convergence, commutativity, and add-wins semantics.

### Realtime Sync

Built on Supabase Realtime (private channels per board):

- **Broadcast batching**: Object mutations are coalesced into 50ms batches before broadcast, reducing message volume during rapid edits (dragging, resizing).
- **Drag throttling**: During shape drags, only local state updates — DB writes are deferred to `dragEnd`. Group children moves accept a `skipDb` flag to avoid N+1 writes.
- **Imperative cursors**: Remote cursor positions bypass React entirely. A ref + `requestAnimationFrame` dirty-flag pattern drives imperative Konva node updates with `layer.batchDraw()` — no reconciliation overhead for 60fps cursor tracking.
- **Z-order batching**: Bring-to-front/send-to-back operations batch all z-index changes into a single `setObjects` call + single broadcast + single DB upsert.
- **Presence tracking**: Online user list with color assignment. Remote selection highlights are memoized and rendered as Konva rectangles around selected shapes.

### Database & Security

Postgres with Row-Level Security (RLS) on every table:

- **21 migrations** covering schema evolution from initial setup through CRDT columns, sharing, connectors, and style properties.
- **RLS policies** use `SECURITY DEFINER` helper functions to avoid self-referencing policy issues (a Supabase gotcha).
- **Sharing model**: `board_members` (role-based: owner/manager/editor/viewer), `board_invites` (pending email invites), `board_share_links` (token-based anonymous join, capped at viewer role).
- **Ownership transfer**: Atomic `transfer_board_ownership` RPC that swaps roles in a single transaction.
- **Soft deletes**: `deleted_at` timestamps for CRDT tombstones rather than hard deletes.

### Undo/Redo

Local-only undo stack (Ctrl+Z / Ctrl+Shift+Z) that's CRDT-compatible:

- Uses a **capture-then-call** pattern: snapshot the before-state, push to the undo stack, then execute the mutation.
- Undo operations execute as new forward operations with fresh HLC clocks — they don't roll back time, they create new "winning" writes. This means undo works correctly even with concurrent remote edits.
- Covers: add, delete, duplicate, move, color, font, stroke, transform, z-order, group, ungroup.
- Stack stored in refs (no re-renders), capped at 50 entries.

## Features

- **Real-time collaboration** — Live cursors, selections, and instant shape sync across all connected clients.
- **Shape registry** — Extensible shape system: rectangles, circles, triangles, parallelograms, chevrons, N-gons (3-100 sides), stars, flowchart shapes, block arrows, and more. All driven by a registry pattern with a single `GenericShape` renderer.
- **Vectors & connectors** — Lines and arrows with endpoint anchors that snap to shape vertices, midpoints, and centers. Connected shapes stay linked when moved.
- **Sticky notes & frames** — Dual-field sticky notes (title + body) and frame containers with auto-containment.
- **Groups** — Group/ungroup with drill-down (double-click to enter, Esc to exit). Full z-order support within groups.
- **Sharing** — Invite by email (direct add or pending invite), share links with role selection, ownership transfer.
- **Infinite canvas** — Pan and zoom with scroll/pinch. Click-and-drag shape drawing.
- **Style controls** — Stroke color/width/dash, fill, opacity, shadow, corner radius, font family/style, text alignment.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS |
| Canvas | Konva / react-konva |
| Backend | Supabase (Postgres, Auth, Realtime, Edge Functions) |
| Auth | Google OAuth via Supabase |
| Deployment | Vercel |

## Getting Started (Local Development)

### Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`)
- Docker (for local Supabase)

### 1. Clone and install

```bash
git clone https://github.com/your-org/collabboard.git
cd collabboard
npm install
```

### 2. Start local Supabase

```bash
npx supabase start
```

This spins up a local Postgres, Auth, Realtime, and Studio instance via Docker. Note the output — it prints the local API URL and anon key.

### 3. Run migrations

```bash
npx supabase db push
```

This applies all 21 migrations in `supabase/migrations/` to your local database.

### 4. Configure environment

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-start>
NEXT_PUBLIC_CRDT_ENABLED=true
```

### 5. Configure Google OAuth (optional for local dev)

In Supabase Studio (`http://127.0.0.1:54323`):
1. Go to Authentication > Providers > Google
2. Add your Google OAuth client ID and secret
3. Set the redirect URL to `http://localhost:3000/auth/callback`

Alternatively, you can use Supabase's email auth for local testing.

### 6. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Deploying to production

Deploy to [Vercel](https://vercel.com) and set the same environment variables pointing to your hosted Supabase project. Run `npx supabase db push` against the remote database.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run test` | Run tests (CRDT merge, HLC) |
| `npx tsc --noEmit` | Type check |
| `npx supabase start` | Start local Supabase (Docker) |
| `npx supabase db push` | Apply migrations |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Landing page
│   ├── boards/             # Board dashboard (protected)
│   ├── board/[id]/         # Board canvas
│   ├── board/join/[token]/ # Share-link join
│   ├── login/              # Google OAuth login
│   └── auth/callback/      # OAuth callback
├── components/
│   ├── board/              # Canvas, shapes, toolbar, share dialog
│   ├── boards/             # Board list, cards
│   └── landing/            # Hero, features
├── hooks/                  # useBoardState, useCanvas, useRealtimeChannel, etc.
├── lib/
│   ├── supabase/           # Client, server, boardsApi
│   └── crdt/               # HLC clock, per-field merge, reconnect reconciliation
└── types/                  # Board, BoardObject, sharing types

supabase/
└── migrations/             # 21 SQL migrations (schema, RLS, RPCs, CRDT columns)
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Delete / Backspace | Delete selected |
| Ctrl+D | Duplicate |
| Ctrl+C / Ctrl+V | Copy / Paste |
| Ctrl+G | Group |
| Ctrl+Shift+G | Ungroup |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Escape | Clear selection / exit group |

## License

Private.
