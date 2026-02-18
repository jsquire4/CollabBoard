# CollabBoard

A real-time collaborative whiteboard. Create, share, and iterate together.

## Features

- **Real-time collaboration** — See cursors and selections from teammates. Changes sync instantly across all devices.
- **Shapes & sticky notes** — Rectangles, circles, triangles, arrows, frames, and more. Group objects, change colors, and organize ideas.
- **Infinite canvas** — Pan and zoom freely. No boundaries.
- **Share & invite** — Invite by email or share a link. Anonymous join for link-only access.
- **Undo/redo** — Full history for add, delete, move, resize, group, and duplicate.

## Tech Stack

- **Next.js 16** (App Router) + React 19 + TypeScript + Tailwind CSS
- **Supabase** — Google OAuth, Postgres with RLS, Realtime (broadcast + presence)
- **Konva / react-konva** — Canvas rendering
- **Vercel** — Deployment

## Conflict Resolution (CRDT)

CollabBoard uses **Hybrid Logical Clocks (HLC)** for deterministic conflict resolution when multiple users edit the same board. Each object carries per-field clocks: every field (`x`, `y`, `color`, `text`, etc.) has its own HLC timestamp.

### How it works

- **Per-field Last-Writer-Wins** — When merging a remote update, each field is resolved independently. The higher clock wins. Concurrent edits to different fields (e.g., one user drags while another changes the color) both survive automatically.
- **Causal ordering** — HLCs preserve causality: if event A happened before B, the clock of B is always greater. For concurrent events, a deterministic tie-break (node ID) ensures all clients converge to the same result.
- **Add-wins delete** — Deletes use a tombstone with their own clock. A delete only wins if its clock is greater than or equal to every field clock on the object. If someone edits the object after it was “deleted,” the update resurrects it—no lost work.
- **Reconnect reconciliation** — On reconnect, local field clocks are compared against the database. Any local wins are pushed to a Supabase Edge Function for server-side merge, so offline edits are never dropped.

Enable with `NEXT_PUBLIC_CRDT_ENABLED=true`. The merge logic is pure TypeScript with 80+ unit tests (convergence, commutativity, add-wins semantics).

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

### Environment Variables

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Optional:

```
NEXT_PUBLIC_CRDT_ENABLED=true   # Enable CRDT merge for conflict resolution (experimental)
```

### Setup

1. Clone and install:

   ```bash
   git clone https://github.com/your-org/collabboard.git
   cd collabboard
   npm install
   ```

2. Configure Supabase:
   - Enable Google OAuth in Authentication → Providers
   - Run migrations: `npx supabase db push`
   - Ensure RLS policies and `board_members`, `board_invites`, etc. are set up

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npx tsc --noEmit` | Type check |
| `npx supabase db push` | Push migrations to remote Supabase |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages & routes
│   ├── page.tsx            # Landing
│   ├── boards/             # Board dashboard
│   ├── board/[id]/         # Board canvas
│   ├── board/join/[token]/ # Share-link join
│   ├── login/
│   └── auth/callback/      # OAuth callback
├── components/
│   ├── board/              # Canvas, shapes, toolbar, share dialog
│   ├── boards/             # Board list, cards, create dialog
│   └── landing/            # Hero, features
├── hooks/                  # useBoardState, useCanvas, useRealtimeChannel, etc.
├── lib/
│   ├── supabase/           # Client, server, boardsApi
│   └── crdt/               # HLC, merge (optional conflict resolution)
└── types/
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Delete / Backspace | Delete selected |
| Ctrl+D | Duplicate selected |
| Ctrl+C | Copy selected |
| Ctrl+V | Paste |
| Ctrl+G | Group selected |
| Ctrl+Shift+G | Ungroup |
| Escape | Clear selection / exit group |

## Deployment

Deploy to [Vercel](https://vercel.com) and set the same environment variables. The app uses Supabase’s hosted Postgres and Realtime.

## License

Private.
