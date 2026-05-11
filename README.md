# Pom Pom

**Pom Pom** is a small web app for **remote study groups**: shared focus rooms with a Pomodoro-style timer, lightweight chat, and **tracked focus time** (stored per profile) so everyone can see effort add up over time—even when you are far apart.

## Stack

- **Next.js** 16 (App Router) · **React** 19 · **TypeScript**
- **Tailwind CSS** · **Framer Motion**
- **Supabase** (Auth + Postgres, `@supabase/ssr`)

## Prerequisites

- **Node.js** 20+ (recommended)
- A **Supabase** project ([supabase.com](https://supabase.com))

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd pom-pom
npm install
```

### 2. Environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Use the **Project URL** and **anon public** key from Supabase: **Project Settings → API**.

### 3. Database

In the Supabase dashboard, open **SQL Editor** and run the script in `supabase/schema.sql`. That creates **profiles**, **sessions**, **daily_stats**, **messages** (and triggers/policies), and registers tables for **Realtime** where needed.

### 4. Auth URLs (Supabase)

Under **Authentication → URL configuration**:

- Set **Site URL** to your deployed origin (for local dev, `http://localhost:3000` is typical).
- Add **Redirect URLs**, for example:
  - `http://localhost:3000/auth/callback`
  - `https://your-production-domain.com/auth/callback`

OAuth (Google) sign-in needs the provider enabled under **Authentication → Providers** with the correct client ID/secret.

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Signed-in users land in the **lobby**; rooms live at `/room/[slug]`.

## Scripts

| Command        | Description              |
|----------------|--------------------------|
| `npm run dev`  | Dev server               |
| `npm run build`| Production build         |
| `npm run start`| Run production server   |
| `npm run lint` | ESLint                   |

## Project layout

- `src/app/` — routes (`/`, `/lobby`, `/room/[slug]`, `/auth/callback`)
- `src/components/` — UI (timer room, chat, auth forms, theme)
- `src/lib/supabase/` — browser and server Supabase clients
- `supabase/` — SQL schema and email template assets

## License

Private / all rights reserved unless you add an explicit license.
