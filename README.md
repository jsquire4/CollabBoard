# Theorem (CollabBoard)

An intelligent strategy canvas for teams that think in frameworks. AI-powered synthesis, real-time collaboration, and a structured workspace — not just a whiteboard.

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS |
| Canvas | Konva / react-konva |
| Backend | Supabase (Postgres, Auth, Realtime) |
| Auth | Google OAuth via Supabase |
| AI | OpenAI (board agents) |
| Email | Resend (invites, password reset) |
| Deployment | Vercel |

### Data Flow

- **Server components** fetch initial data (board, user, role) and pass it to client components as props.
- **Client components** use the Supabase browser client for mutations.
- **Shapes**: Persist first (with retry/rollback), broadcast to Realtime only on success.
- **Groups**: Parent insert is awaited before children (FK safety).

### Realtime Architecture

- Single private channel per board: `board:{boardId}`.
- **Broadcast**: Object changes (`board:sync`), selection changes (`selection`, debounced 100ms).
- **Presence**: Online users, remote selections (cleaned up when users leave).
- **Cursors**: Bypass React — ref + `requestAnimationFrame` → imperative Konva node updates.
- Channel `subscribe()` is called last in `BoardClient` after all listeners are registered.

### Key Directories

```
src/
├── app/                    # Pages (Server Components)
│   ├── page.tsx            # Landing (redirects auth users to /boards)
│   ├── boards/             # Board dashboard
│   ├── board/[id]/         # Board canvas
│   ├── board/join/[token]/ # Join via invite link
│   ├── login/              # Google OAuth
│   └── auth/callback/      # OAuth → /boards
├── components/
│   ├── board/              # Canvas, shapes, toolbar, agents, share, etc.
│   ├── landing/            # Hero, features, footer
│   └── login/              # Login, reset password
├── hooks/                  # useBoardState, useCanvas, useRealtimeChannel, useCursors, etc.
├── contexts/               # BoardContext, BoardMutationsContext, BoardToolContext
└── lib/supabase/           # Server and browser clients
```

### Database (Postgres + RLS)

- **boards**: id, name, created_by, timestamps.
- **board_objects**: Shapes (sticky_note, rectangle, circle, frame, group, line, connector, table, etc.), with x, y, width, height, z_index, parent_id, from_id/to_id for connectors.
- **board_members**: Roles (owner, editor, viewer) and sharing.
- **files**, **comments**, **decks**: AI agents, file uploads, comments.
- RLS: Users CRUD own boards; authenticated users can view boards they have access to.

---

## Features

- **AI Board Agents** — Analyze the canvas, surface insights, connections, and next steps.
- **Real-time Collaboration** — Live cursors, presence, instant sync. See who’s online and what they’re selecting.
- **Structured Canvas** — Sticky notes, rectangles, circles, frames, tables, connectors, groups. Z-order, multi-select (shift/ctrl, marquee), grouping.
- **Rich Text** — TipTap in-place editing for supported shapes (when `NEXT_PUBLIC_RICH_TEXT_ENABLED=true`).
- **Sharing** — Invite via link or email (Resend). Role-based access (owner, editor, viewer).
- **Files** — Upload and attach files to boards.
- **Comments** — Threaded comments on objects.
- **Grid & Themes** — Configurable grid style and colors.
- **Keyboard Shortcuts** — Delete, Ctrl+D duplicate, Ctrl+G group, Ctrl+Shift+G ungroup, Escape.

---

## Local Setup

### Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker (for local Supabase)

### 1. Clone and Install

```bash
git clone https://github.com/your-org/collabboard.git
cd collabboard
npm install
```

### 2. Start Supabase

```bash
npx supabase start
npx supabase db push
```

### 3. Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in the values. See `.env.example` for the full list.

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | From `npx supabase start` or Supabase dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key |
| `OPENAI_API_KEY` | Yes (for AI agents) | OpenAI API key |
| `AGENT_INTERNAL_SECRET` | Yes (for AI agents) | Random 64-char hex (e.g. `openssl rand -hex 32`) |
| `RESEND_API_KEY` | For email invites | Resend API key |
| `NEXT_PUBLIC_APP_URL` | Yes | `http://localhost:3000` for local dev |
| `NEXT_PUBLIC_RICH_TEXT_ENABLED` | Optional | `true` to enable TipTap rich text |

### 4. Google OAuth (Optional)

1. Open Supabase Studio: `http://127.0.0.1:54323`
2. **Authentication → Providers → Google**: Add your OAuth client ID and secret.
3. **URL Configuration → Redirect URLs**: Add `http://localhost:3000/auth/callback`.

Without OAuth, you can still run the app; login will redirect to the Site URL.

### 5. Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npx tsc --noEmit` | Type check |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:stress` | Stress tests (CRDT, bulk ops) |
| `npm run test:e2e` | E2E smoke tests (Playwright) |
| `npm run test:e2e:stress` | E2E performance + multi-user load |
| `npm run test:all` | Full suite |

---

## Deploy

Deploy to [Vercel](https://vercel.com) with the same env vars pointing to your hosted Supabase project. Run `npx supabase db push` against the remote database. Set `NEXT_PUBLIC_APP_URL` to your production URL (e.g. `https://www.theoremai.app`) and add `{NEXT_PUBLIC_APP_URL}/auth/callback` and `{NEXT_PUBLIC_APP_URL}/reset-password` to Supabase redirect URLs.

---

## License

MIT
