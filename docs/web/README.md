# Quran Association Manager — web version

The web version runs the desktop app in the browser for many branches at once. A platform
administrator creates each branch and invites its Superadmin; that Superadmin adds or invites the
branch's users. The interface is the desktop's, in Arabic, with the same roles and rules.

- Design and decisions: [design-deliberation.md](design-deliberation.md) (the "Operations Room"
  deliberation and its final plan).
- The prompt used for it, in English: [prompts/operations-room.en.md](prompts/operations-room.en.md).

## What it adds to the desktop app

| | Desktop | Web |
| --- | --- | --- |
| Where the data is | An encrypted SQLite file on one PC | PostgreSQL on a server, one schema per branch |
| Branches | One per installation | Any number, each at its own address `/b/<code>/` |
| First Superadmin | Created on first launch | Invited by a platform administrator |
| Other users | Created by the Superadmin | Created, **or invited by link** (email or WhatsApp) |
| Sessions | One window | Any device; the Superadmin sees open sessions and can end them |
| Activity log | Log file | Logins, invitations, exports, restores per branch, and platform-wide |
| Backups | `.qdb` file to a folder, on a schedule | Nightly server backups, plus a `.qdb` download any time |
| Desktop data | — | A desktop `.qdb` backup restores into a branch (users and passwords included) |
| Platform console | — | Branches, their status and numbers, Superadmin invitations, suspension, platform admins |

A `.qdb` file is the same in both directions: a web backup restores in the desktop app, and a
desktop backup restores on the web (with the branch's transfer key).

## Roles

| Who | Signs in at | Can |
| --- | --- | --- |
| Platform administrator | `/platform` | Create, edit, suspend and reactivate branches; invite a branch Superadmin; add platform admins; read the platform audit log. **No access to any branch's data.** |
| Branch Superadmin | `/b/<code>/` | Everything in the branch, as on the desktop, plus invitations, open sessions, the branch activity log, backup download and restore. |
| Administrator, FinanceManager, SessionSupervisor | `/b/<code>/` | Exactly as on the desktop. |

## Running it

Requirements: Docker with Compose, or Node.js 22 and PostgreSQL 14+.

### With Docker (recommended)

```bash
cp web/.env.example web/.env          # set PUBLIC_URL, SESSION_SECRET, POSTGRES_PASSWORD
docker compose -f web/docker-compose.yml up -d --build
docker compose -f web/docker-compose.yml exec app \
  node web/server/cli.js create-admin --email you@example.org --name "Your name"
```

Open `PUBLIC_URL/platform`, sign in, create a branch, and send the Superadmin the invitation link.

HTTPS: set `DOMAIN` in `web/.env`, point the domain at the server, and add
`--profile https` to the `up` command: Caddy obtains and renews the certificate. Behind your own
proxy instead, forward to port 8080 and keep `TRUST_PROXY=1`. Without any proxy, set
`TRUST_PROXY=0` (otherwise a client could fake its address in the rate limits).

### Without Docker

```bash
npm ci --ignore-scripts               # repository root: the shared code's dependencies
cd web
npm ci                                # the server's dependencies
npm run build:client                  # the browser app → web/dist
export DATABASE_URL=postgres://user:pass@localhost:5432/qam
export SESSION_SECRET=$(openssl rand -hex 32) PUBLIC_URL=https://quran.example.org NODE_ENV=production
npm run create-admin -- --email you@example.org --name "Your name"
npm start
```

For development: `npm run dev` (server, port 8080) and `npm run dev:client` (Vite, port 5173,
proxies `/api`).

### Configuration

| Variable | Default | |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/qam` | |
| `PUBLIC_URL` | `http://localhost:8080` | Used in invitation links. `https://` required in production. |
| `SESSION_SECRET` | — | 32+ characters, required in production. |
| `PORT` | `8080` | |
| `DATA_DIR` | `web/data` | Branch logos, temporary uploads and downloads, pre-restore safety copies. |
| `SMTP_URL`, `MAIL_FROM` | — | Optional: email the invitations. |
| `TRUST_PROXY` | `0` | Number of proxies in front of the app. |
| `SESSION_IDLE_HOURS`, `SESSION_MAX_HOURS` | `12`, `72` | Sessions slide with use up to the maximum. |
| `INVITE_DAYS` | `7` | Invitation lifetime. |
| `MAX_UPLOAD_MB` | `50` | Excel imports, logos, backups to restore. |
| `SCHEDULER_ENABLED` | `true` | The daily fee-charge check of every branch. |

### Administration commands

```bash
node web/server/cli.js migrate                         # also runs at every start
node web/server/cli.js create-admin --email … --name …  # password asked, or ADMIN_PASSWORD
node web/server/cli.js create-branch --name "فرع سوسة" --slug sousse [--invite-email …]
```

### Backups and restores (operators)

`docker compose` runs a `backup` service: every night a `pg_dump` of the whole database and an
archive of `DATA_DIR/branches` go to `web/backups/`, kept 14 days (`BACKUP_KEEP_DAYS`). Copy
that folder off the server. To restore everything: `pg_restore -c -d qam qam-<date>.dump` and
unpack the files archive into `DATA_DIR`.

A single branch restores from the branch itself: its Superadmin uploads a `.qdb` file in
Settings → Backup. The current data is saved first to
`DATA_DIR/branches/<id>/safety-backups/`.

## How it works

The desktop app is one codebase with a web build; nothing was rewritten.

- **Handlers.** The server loads the desktop's IPC handlers (`src/main/handlers`) through
  `web/server/bootstrap.js`, which gives them per-request versions of Electron, electron-store,
  the database module, the settings cache and the logger. `POST /api/b/<code>/rpc/<channel>`
  calls one, with the desktop's role table (`src/main/ipcSecurity.js`) and argument schemas
  (`src/main/ipcValidation.js`).
- **Browser.** The renderer (`src/renderer`) is built with `window.electronAPI` coming from the
  desktop's own `src/main/preload.js`, whose `ipcRenderer` is replaced by an HTTP client
  (`web/client/src/electronRenderer.js`). File dialogs become a file picker and upload (open) or
  a download (save). Web-only parts of shared screens sit behind the `__QAM_WEB__` build flag
  (`src/renderer/utils/platform.js`), which is `false` in the desktop build.
- **Isolation.** Each branch has its own PostgreSQL schema `branch_<id>` with the desktop tables
  (`web/server/db/branch-schema.sql`, generated from the desktop schema and migrations). A
  request's connection is set to its branch's schema when it is taken from the pool and reset
  when it is returned; without a branch, no query runs. Platform data (branches, admins,
  sessions, invitations, audit) is in the `platform` schema.
- **SQL.** The handlers' SQLite SQL runs through `web/server/db/sql.js` (placeholders,
  `INSERT OR IGNORE/REPLACE`, camelCase aliases, `LIKE`) and the `compat` schema's SQLite
  functions (`strftime`, `date`, `group_concat`, two-argument `max`/`min`, `sqlite_master`…).
  Inside a transaction each statement has its own savepoint, so a failed statement does not
  abort the rest, as in SQLite.
- **Sessions.** An httpOnly, `SameSite=Strict` cookie per branch path; only its SHA-256 is
  stored. Every request re-reads the user's current roles. A header (`X-QAM`) is required on
  every state-changing call. Suspending a branch ends its sessions.
- **Invitations.** 32 random bytes; only the SHA-256 is stored; single use; expire after
  `INVITE_DAYS`; revocable; the role is fixed when created.

### When the desktop schema changes

1. `cd web && npm run generate-schema` (new branches).
2. Add the same change for existing branches in `web/server/db/branch-migrations/`.

## Tests

```bash
cd web
npm run test:sweep    # every channel through the web dispatcher on PostgreSQL, incl. backup round trip
npm run test:pg       # the desktop's real-database tests (tests/db) on PostgreSQL
npm run test:e2e      # browser: the desktop's UI specs + platform, invitations, files (needs build:client)
```

They need a PostgreSQL server (`TEST_DATABASE_URL`; the defaults use `postgres:postgres` on
localhost). The desktop's own tests (`npm test` at the root) are unchanged.

## Known limits

- **No offline mode in the browser.** If the connection drops, a save fails with a message and
  the form keeps what was typed. The desktop app remains the offline option.
- **PDF export stays off**, as on the desktop: Arabic letters now join correctly in PDFs (the
  font is loaded), but some spaces between words are still lost in mixed right-to-left lines.
  Excel and Word exports are complete.
- **One server process.** Rate limits, uploads and downloads waiting to be fetched live in
  memory; run one instance (or add a shared store before scaling out).
- **No cross-branch reports yet**, and platform admins cannot open branch data by design.
