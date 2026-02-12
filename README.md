# ⛳ Fairway Live — Golf Event Platform

Live scoring platform for golf events. Admin creates courses, events, and teams. Each team gets a QR code linking to a mobile-friendly score entry page.

## Stack
- **Cloudflare Pages** (hosting + functions)
- **D1** (SQLite database)
- **React** + React Router (SPA)
- **QRCode.react** (client-side QR generation)

---

## 🚀 Deployment Guide (Cloudflare UI + GitHub)

### Step 1: Create D1 Database

1. Go to **Cloudflare Dashboard → Workers & Pages → D1**
2. Click **Create database**
3. Name it `golf-db`
4. Copy the **Database ID** — you'll need it

### Step 2: Run Migrations

In the D1 dashboard for your `golf-db`:

1. Click the **Console** tab
2. Paste the contents of `migrations/0001_schema.sql` and click **Execute**
3. Paste the contents of `migrations/0002_seed.sql` and click **Execute**

This creates all tables and seeds a "Demo Course" organization.

### Step 3: Push to GitHub

```bash
git init
git add -A
git commit -m "Initial golf platform"
# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USER/golf-platform.git
git branch -M main
git push -u origin main
```

### Step 4: Connect to Cloudflare Pages

1. Go to **Cloudflare Dashboard → Workers & Pages**
2. Click **Create → Pages → Connect to Git**
3. Select your `golf-platform` repo
4. Build settings:
   - **Framework preset**: None
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Click **Save and Deploy**

### Step 5: Bind D1 Database

After the first deploy:

1. Go to your Pages project **Settings → Bindings**
2. Click **Add → D1 database**
3. Variable name: `DB`
4. Select your `golf-db` database
5. Click **Save**
6. **Redeploy** (Settings → Deployments → retry latest)

### Step 6: (Optional) Protect Admin with Cloudflare Access

1. Go to **Cloudflare Zero Trust → Access → Applications**
2. Add an application → Self-hosted
3. Application domain: `your-project.pages.dev`
4. Path: `/admin*` and `/api/admin*`
5. Add a policy (e.g., allow your email)

---

## 🏗 Local Development

```bash
npm install

# Run migrations locally
npx wrangler d1 execute golf-db --local --file=migrations/0001_schema.sql
npx wrangler d1 execute golf-db --local --file=migrations/0002_seed.sql

# Build frontend + run with Pages dev server + local D1
npm run build
npx wrangler pages dev dist --d1=DB
```

Then open http://localhost:8788

---

## 📁 Project Structure

```
├── migrations/          # D1 SQL migrations
│   ├── 0001_schema.sql  # All tables
│   └── 0002_seed.sql    # Demo org seed
├── functions/           # Cloudflare Pages Functions (API)
│   ├── _shared.js       # ID generation, response helpers
│   └── api/
│       ├── admin/       # Admin endpoints (Access-protected)
│       │   ├── orgs.js
│       │   └── orgs/[orgId]/courses.js
│       │   └── orgs/[orgId]/events.js
│       │   └── events/[eventId]/index.js
│       │   └── events/[eventId]/teams/index.js
│       │   └── events/[eventId]/teams/bulk.js
│       │   └── events/[eventId]/status.js
│       └── score/       # Public team endpoints (no auth)
│           └── [accessToken]/context.js
│           └── [accessToken]/hole.js
├── src/                 # React frontend
│   ├── App.jsx          # Router
│   ├── api.js           # API client
│   ├── index.css        # Full design system
│   └── pages/
│       ├── AdminHome.jsx
│       ├── OrgDetail.jsx    # Courses + Events
│       ├── EventDetail.jsx  # Teams + QR + Status
│       ├── QRPack.jsx       # Printable QR cards
│       └── ScoreEntry.jsx   # Team scoring (mobile)
├── public/
│   ├── _routes.json     # Only /api/* goes to Functions
│   └── _redirects       # SPA fallback
├── wrangler.toml        # D1 binding config
└── package.json
```

---

## 🎯 Usage Flow

1. **Admin** goes to `/admin` → clicks the Demo org
2. **Creates a course** with 18-hole pars
3. **Creates an event** selecting that course (9 or 18 holes)
4. **Adds teams** (single or bulk import)
5. **Prints QR pack** — one card per team
6. **Sets event to "Live"**
7. **Teams** scan their QR → `/score/:token` → enter strokes per hole
8. Admin can **complete** the event to lock scores

---

## 📌 Notes

- `wrangler.toml` has `database_id = "YOUR_DATABASE_ID_HERE"` — update this only if using `wrangler` CLI. The Cloudflare UI binding overrides it.
- Access tokens are 32-char random strings. The short code on QR cards is the first 8 chars (for manual entry fallback).
- All IDs use `crypto.randomUUID()` with prefixes for readability.
- Event pars are **snapshotted** at creation time — editing the course later won't affect existing events.
