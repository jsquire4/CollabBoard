# CollabBoard

A real-time collaborative whiteboard built with Next.js, Supabase, and Konva.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React, TypeScript, Tailwind CSS |
| Canvas | Konva / react-konva |
| Backend | Supabase (Postgres, Auth, Realtime) |
| Auth | Google OAuth via Supabase |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker (for local Supabase)

### Setup

```bash
git clone https://github.com/your-org/collabboard.git
cd collabboard
npm install
npx supabase start
npx supabase db push
```

Copy the example env file and fill in your keys:

```bash
cp .env.example .env.local
```

See `.env.example` for all required and optional variables. The Supabase keys come from `npx supabase start` output (local) or your Supabase dashboard (hosted).

Optionally configure Google OAuth in Supabase Studio (`http://127.0.0.1:54323`) under Authentication > Providers > Google, with redirect URL `http://localhost:3000/auth/callback`.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Deploy

Deploy to [Vercel](https://vercel.com) with the same env vars pointing to your hosted Supabase project. Run `npx supabase db push` against the remote database.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npx tsc --noEmit` | Type check |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:stress` | Stress tests (CRDT convergence, bulk ops) |
| `npm run test:e2e` | E2E smoke tests (Playwright) |
| `npm run test:all` | Full suite |

## License

MIT
