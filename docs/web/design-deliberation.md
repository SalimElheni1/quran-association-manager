# Operations Room: the web version of Quran Association Manager

This is the "Operations Room" prompt ([English version](prompts/operations-room.en.md)) run on
this project before any web code was written. The decisions in the Maestro section are the ones
the `web/` code implements.

**Goal / problem:** build a web version of the Electron desktop app, with more features, so that
many users and many association branches can use it. A platform administrator creates a branch
and invites the branch's superadmin; that superadmin then adds the branch's users and invites
them. The interface stays in Arabic. Stack: React + Node API + PostgreSQL.

**Facts the room was given (from the repository):**

- 16 IPC handler modules, about 8,900 lines, about 400 SQL queries written for SQLite, behind
  one bridge (`window.electronAPI` in `src/main/preload.js`, 140 methods).
- Authorization already sits in one place: `src/main/ipcSecurity.js` maps every channel to the
  roles allowed to call it (Superadmin, Administrator, FinanceManager, SessionSupervisor), and
  `src/main/ipcValidation.js` checks the arguments of every channel.
- The handlers keep module-level state: one database connection (`src/db/db.js`) and one session
  registry (`src/main/sessionManager.js`).
- Files go through Electron dialogs: exports call `dialog.showSaveDialog`, Excel imports, logo
  uploads and backup restores call `dialog.showOpenDialog`.
- The data includes children's names, birth dates and parents' phone numbers.
- The app has been in daily use at one branch since August 2025, so a branch already holds data.

---

## Transcript

**Recorder:** The room is sealed. The Maestro sits in the corner and says nothing. First, the
Specialist.

**Recorder:** After reading the goal, the room summons **Dr. Lena Brandt**, an architect who has
moved several single-site desktop products (school management, clinic records) onto shared
multi-tenant platforms, and who has spent as much time cleaning up after data leaks between tenants
as building the platforms. The Engineer is **Karim**, the Devil's Advocate is **Nadia**, the Dumb
Client is **Hedi**, treasurer of a branch in Sousse.

**Lena (Specialist):** Before anyone draws boxes, the roots. This problem has three of them.
One: the value of this product is not its screens, it is the fee logic, which bills monthly or
yearly per age group, carries arrears across academic years and handles refunds and receipt books.
That logic is tested and it is in production. Two: "multi-tenant" here means one branch must never
see another branch's children. That is a safeguarding problem before it is a technical one. Three:
the people using it are volunteers. If it is harder than the desktop app, they will go back to
paper. Karim, show us your plan.

**Karim (Engineer):** Draft one. A clean, modern rewrite: a new REST API in Node with Express, one
endpoint per resource (`/students`, `/classes`, `/fees`...), PostgreSQL with a `tenant_id` column on
every table, and the React pages rebuilt against the new API with React Query. The fee logic gets
reimplemented in a service layer with proper types. Each branch is a tenant, users log in with
email and password, and a platform admin creates tenants. Twelve weeks.

**Nadia (Devil's Advocate):** Rejected. Fatal flaw number one: you're proposing to **rewrite
2,582 lines of student-fee code** that already handles annual vs monthly charges, discounts, prior
year arrears, refunds that restore `amount_paid`, and receipt numbering per book. Every one of
those rules was a bug report once. A rewrite reintroduces them, and this time the bug is a parent
billed twice. "Twelve weeks" is a fantasy: the desktop app keeps shipping features while you
rewrite, so you're chasing a moving target and you'll end up with two products that disagree about
money.

**Hedi (Dumb Client):** I don't know what a "tenant" is. Am I a tenant? I pay rent? What I know
is: I click "تسجيل دفعة", type 30 dinars, print the receipt. If the web one does it differently,
I'm calling Salim at 10 pm. And "email and password"? Half of our teachers don't use email. They
use WhatsApp.

**Karim:** Fair on the rewrite cost. But the desktop handlers are Electron code: `ipcMain.handle`,
`dialog.showSaveDialog`, `BrowserWindow`. You can't put that on a server.

**Lena:** Can't you? Look at what the handlers actually depend on. They register on `ipcMain`, get
an `event` and arguments, and return plain objects. Authorization is decided centrally in
`ipcSecurity.js` from a channel → roles table. That is an RPC server already. The renderer calls
140 named methods on `window.electronAPI`. If you give the server a fake `ipcMain` that collects
the handlers, and give the browser a fake `electronAPI` that turns each call into
`POST /api/rpc/<channel>`, the existing pages and the existing business logic run unchanged.

**Nadia:** Cute, and dangerous. Fatal flaw number two, and this one kills your shortcut, Lena:
**the handlers are written for one user on one machine.** `db.js` holds a single module-level
connection. `sessionManager.js` keys sessions by `event.sender.id`. On a server, two requests from
two branches arrive in the same Node process at the same millisecond. If the "current database" is
a global, branch A's attendance gets written into branch B. That is not a bug, that is a data
breach involving minors.

**Karim:** Then the context must be per request, not global. Node has `AsyncLocalStorage`: every
request runs inside its own async context carrying the branch, the user and a dedicated database
client. `db.runQuery()` keeps its signature but looks up the client in the current context instead
of a global. The handlers don't change; only `db.js` gets a web twin.

**Nadia:** And when someone writes `setTimeout` or a fire-and-forget promise inside a handler, the
context still follows it? And when the context is missing?

**Karim:** `AsyncLocalStorage` follows timers and promises. When there is no context, the web
`db` adapter throws instead of falling back to anything. No context, no query. Default deny.

**Lena:** Good, but now the second-order effect of Karim's original `tenant_id` column. With 400
hand-written SQL queries, **one** missing `AND tenant_id = ?` leaks a branch. You'd have to edit
every one of those queries, and every future query must remember it forever. I've seen exactly this
leak in production twice. Don't put the isolation in the queries. Put it in the database.

**Karim:** Row-level security, then: `tenant_id` plus Postgres RLS policies.

**Lena:** That still means adding `tenant_id` to every insert in 400 queries, because the existing
`INSERT` statements don't set it. Consider **one Postgres schema per branch** instead. Each branch
gets `branch_<id>` with exactly the desktop tables. The request's client runs
`SET LOCAL search_path TO branch_<id>` inside its transaction. The existing queries say
`SELECT * FROM students`, which now can only mean *this branch's* students. There is no
cross-branch query to forget. Platform data (branches, platform admins, invitations) lives in its
own `platform` schema, which branch requests never search.

**Nadia:** Schema-per-tenant has its own disasters. Migrations: with 300 branches, a migration runs
300 times and fails on branch 173. Connection pooling: `search_path` leaks between pooled
connections if anyone forgets to reset it.

**Lena:** Both are real, both are solvable. `SET LOCAL` only lasts until the transaction ends, so
it can't leak into the next request that borrows the connection, provided every request runs in a
transaction, which we enforce in one place. Migrations: each schema keeps its own
`schema_migrations` table and each migration is applied per schema inside its own transaction.
A failure on one branch stops and reports that branch and leaves the others consistent. And this is
an association network, not a consumer app: hundreds of branches, not millions. Schema-per-branch is
comfortable at that size. It also gives you something `tenant_id` never will: **a branch's data
can be exported, restored or deleted as one unit.** When a branch leaves, you drop one schema.

**Hedi:** I understood "drop one schema" as "you delete my branch". Please don't.

**Lena:** Only when a branch asks to leave, and only after exporting. Noted for the Maestro:
deleting a branch must need a typed confirmation and give an export first.

**Nadia:** Fatal flaw number three. Karim, the SQL. These 400 queries are **SQLite**. `INSERT OR
REPLACE`, `INSERT OR IGNORE`, `strftime('%Y', ...)`, `GROUP_CONCAT`, `COLLATE NOCASE`,
two-argument `MAX(a, b)`, and SQLite's loose typing, where `'5' = 5` is true. Point the handlers at
Postgres and half of them fail on the first click. Also Postgres folds unquoted aliases to lower
case, so `SELECT COUNT(*) AS totalStudents` comes back as `totalstudents` and the dashboard shows
zeros. Nobody notices for a month.

**Karim:** Then the web `db` adapter carries a small, tested SQLite compatibility layer:

1. In Postgres, a `compat` schema with SQLite's functions: `strftime`, `group_concat`, `ifnull`,
   two-argument `max`/`min`, `round(double, int)`, and a case-insensitive `nocase` collation.
   Those are real database functions, not regexes.
2. In the adapter, a few rewrites that can't be functions: `?` placeholders, `INSERT OR IGNORE` →
   `ON CONFLICT DO NOTHING`, `INSERT OR REPLACE INTO settings` → an upsert on its key, and quoting
   of camelCase aliases.
3. Values sent as literals that Postgres resolves against the column type, which reproduces
   SQLite's tolerance for `'5'` vs `5` without changing a single handler.
4. Counts and sums come back as JS numbers, not strings.

**Nadia:** "Tested" how? Your adapter is guessing at 400 queries.

**Karim:** Not guessing: running. The repository already has a real-world scenario (128 students,
9 classes, attendance and a year of fees). The web build gets an end-to-end test that drives the
real pages through login, students, classes, attendance, a fee payment, a receipt and an export
against a real Postgres. And every channel is invoked once in an automated sweep. A channel that
throws a SQL error fails the test.

**Hedi:** You keep talking about tests. My question: I have **two years of data** in the desktop
app. Do I type it all again? Because if yes, I'm staying on the desktop.

**Lena:** That is the most important sentence in this room. Without migration, no existing branch
moves, and the web version only serves new branches. The desktop app already produces encrypted,
signed `.qdb` backups that can be opened with the association transfer key. The web version must
accept that file: the branch superadmin uploads it with the key, the server opens it (same
`better-sqlite3-multiple-ciphers` library, same decryption code), and copies every table into the
branch's schema in one transaction. Then the branch logs in and sees its own data.

**Nadia:** And the users table inside that backup? It has its own superadmin with its own
password. Do they silently become web accounts?

**Karim:** Yes, they're the branch's users, with their roles and password hashes intact (bcrypt,
the same library). That's the point of the import: the same people log in with the same usernames
and passwords. The superadmin who ran the import confirms with their *current web* password first,
and because the import replaces the branch's data, the server makes a safety export before writing.

**Hedi:** Now login. Do I type a "tenant ID"?

**Karim:** Draft two: each branch has its own address, `/b/sousse`. The login page at that address
shows *that branch's* logo and name, and asks for username and password, exactly like the desktop.
The platform admin has a separate address, `/platform`.

**Hedi:** Better. I can bookmark that. But the invitation, by email...

**Karim:** An invitation is a link. If the server has email configured it sends the link by email,
and the person who invited always sees the link with a **"send via WhatsApp"** button and a copy
button. The invitee opens it, sees the branch name, chooses a username and password, done.

**Nadia:** Fatal flaw number four: invitation links are bearer credentials. Whoever gets the
WhatsApp forward gets the account. And what stops the platform admin from inviting themselves as
superadmin of every branch and reading the children's records?

**Lena:** Two separate answers. For the links: random 32-byte tokens, only the SHA-256 hash is
stored, single use, they expire (7 days by default), and the inviter can revoke them or send a new
one. The role is fixed at creation and the invitee can't change it. For the platform admin: the
platform role and the branch roles are **different accounts in different schemas**. The platform
admin can create, suspend and reactivate a branch and (re)invite its superadmin, and nothing
else. There is no "log in as branch" button. If you want support access later, it needs the
branch superadmin's consent and an audit trail. That's a design decision, not an oversight.

**Nadia:** But the platform admin can re-invite a superadmin, and that invite creates a new
Superadmin in the branch. That's a back door.

**Karim:** Then make it visible: every invitation is recorded with who created it, and the branch's
Users page lists pending invitations, so the branch superadmin sees "invited by the platform" and
can revoke it. Re-inviting exists because "our only superadmin lost their password" is the most
common support ticket there will ever be.

**Lena:** Accepted. Next, the second-order effects of moving from a PC to a server:

- **Backups change owners.** On the desktop, the treasurer backs up to a USB stick. On the web,
  the platform is responsible. So: a nightly `pg_dump` is the operator's job (documented, with a
  compose service that does it), and every branch superadmin can still **download their own
  branch** as a file at any time. The data stays theirs.
- **The fee scheduler** (`feeChargeScheduler.js`) used to run while one app was open. On the
  server it must run for every active branch, each inside that branch's context, and a failure in
  one branch must not stop the others.
- **Files.** Exports used to be written to a path chosen in a save dialog. On the web, the server
  writes to a private temporary folder, and the browser downloads the file with a one-time link.
  Uploads go the other way: the browser asks for the file *before* calling the handler, and the
  server's "open dialog" returns the uploaded file.
- **Sessions.** The desktop trusted the window. On the web: an `httpOnly`, `SameSite=Strict`,
  `Secure` cookie bound to one branch, server-side session rows that can be revoked, login rate
  limiting per username and per IP, and a custom header required on every API call as CSRF
  protection.
- **Suspended branches** must stop working immediately, including sessions already open.

**Hedi:** What happens when the internet drops in the middle of attendance? At the mosque, the
Wi-Fi is the imam's phone.

**Karim:** First version: the page tells you clearly that the save failed and keeps what you
ticked, so you press save again when the connection comes back. Real offline mode is a large
project of its own, and the desktop app remains the offline option for branches that need it.

**Nadia:** That's an honest answer. I'll accept it only if it's written down, not discovered.

**Hedi:** Last thing. If you change the desktop app next month, does the web one get it?

**Karim:** Draft three answers that: **one codebase.** The handlers and the pages stay in
`src/`, shared. Everything web-specific (server, compatibility layer, platform pages, branch login,
invitations, shims) lives in `web/`. Where a page has to behave differently on the web, it checks
one build flag, so the desktop build is byte-for-byte unaffected in behavior. A fee fix lands in
both on the next release.

**Nadia:** And the Electron native module? The root `npm install` rebuilds
`better-sqlite3-multiple-ciphers` for Electron. On a Node server that build doesn't load.

**Karim:** The server has its own `web/package.json` with its own Node build of that module, used
only for importing desktop backups. The shared handlers use the Postgres adapter, never SQLite.

**Lena:** One more root: **"more features."** Resist bolting on twenty. What the web version
uniquely enables is the multi-branch layer. In scope: the platform console (branches, their
status, counts of users and students, last activity), invitations, branch suspension, desktop
import, branch export, an audit trail of security events. Everything else (SMS reminders, parent
portal, consolidated national reports) comes after branches are actually running on it.

**Nadia:** I've run out of fatal flaws that the plan doesn't answer. I'm noting my remaining
worries as risks, not objections: the compatibility layer's long tail of rare queries, and
operators who never configure backups.

**Hedi:** I have no objections, only a request: the Arabic must be the same Arabic. Not Google
Translate Arabic.

**Recorder:** The deliberation is exhausted. The Maestro stands up.

---

## The Maestro: final answer

### 1. Architecture

```
Browser (Arabic RTL)                          Node server (web/server)                PostgreSQL
┌──────────────────────────┐   HTTPS + cookie   ┌──────────────────────────────┐   ┌───────────────────┐
│ /b/<branch>/  existing    │ ─────────────────▶│ POST /api/b/<branch>/rpc/:ch  │   │ platform schema   │
│   React pages (src/       │                   │  ├ session + role check       │   │  branches, admins,│
│   renderer), unchanged    │                   │  │  (ipcSecurity CHANNEL_ROLES)│   │  invitations,     │
│ window.electronAPI = web  │                   │  ├ argument check             │   │  sessions, audit  │
│   shim → fetch            │                   │  │  (ipcValidation)            │   ├───────────────────┤
│ /platform/  platform      │                   │  ├ AsyncLocalStorage context  │──▶│ branch_1 schema   │
│   console (new)           │                   │  │  {branch, user, pg client} │   │ branch_2 schema   │
│ /invite/<token> (new)     │                   │  └ existing src/main handlers │   │ … one per branch  │
└──────────────────────────┘                    │ electron shim (ipcMain, dialog│   │ compat schema:    │
                                                │  app, BrowserWindow, Store)   │   │  SQLite functions │
                                                └──────────────────────────────┘   └───────────────────┘
```

- **One codebase.** Shared handlers and pages in `src/`; web-only code in `web/`; desktop behavior
  unchanged.
- **Isolation in the database.** One Postgres schema per branch; each request gets its own
  connection, set to its branch's schema when taken from the pool and reset when returned; no
  global connection; no context means no query. (Built this way rather than one transaction per
  request: SQLite handlers expect a failed statement not to abort what follows, so statements run
  in autocommit, and inside the handlers' own transactions each statement gets a savepoint.)
- **Authorization reused.** The channel → roles table and the argument schemas from the desktop
  are applied by the web server to every RPC call. Channels that only make sense on a desktop
  (choose a folder, relaunch, read the log file) are replaced or refused on the web.

### 2. Accounts and roles

| Who                | Where                     | Can do                                                                       |
| ------------------ | ------------------------- | ---------------------------------------------------------------------------- |
| Platform admin     | `/platform`               | Create, edit, suspend, reactivate branches; invite or re-invite a branch superadmin; see branch statistics; manage platform admins. **Cannot open branch data.** |
| Branch Superadmin  | `/b/<branch>`             | Everything in the branch, including users, invitations, desktop import, branch export. |
| Administrator, FinanceManager, SessionSupervisor | `/b/<branch>` | Exactly as on the desktop.                         |

The first platform admin is created from the command line (`node web/server/cli.js
create-admin`); there is no default account.

### 3. Invitations

- Created by a platform admin (role: Superadmin only) or a branch Superadmin (any role).
- 32 random bytes, SHA-256 hash stored, single use, 7-day expiry, revocable; the role is fixed.
- Sent by email when SMTP is configured; the inviter always gets the link, a copy button and a
  WhatsApp button.
- The invitee opens `/invite/<token>`, sees the branch name and role, chooses username, name and
  password (the desktop password policy), and is signed in.
- The branch Users page lists pending invitations with who created them.

### 4. Data and migrations

- `web/server/db/branch-schema.sql`: the desktop schema after migration 062, written for Postgres
  (TEXT dates kept as on the desktop so date comparisons behave the same).
- `compat` schema: `strftime`, `date`, `datetime`, `group_concat`, `ifnull`, `max`/`min` with
  two arguments, `round(double precision, int)`, a `nocase` collation, a `sqlite_master` view and
  `table_info()` for `PRAGMA table_info`.
- Versioned migrations per schema, each in its own transaction, recorded in that schema.
- Reference data (surahs, hizbs, default age groups, categories) seeded per branch at creation,
  using the desktop's own seed functions.

### 5. Desktop → web migration

The branch superadmin uploads a desktop `.qdb` backup plus the association transfer key, confirms
with their password, and the server: makes a safety export of the branch, decrypts and verifies the
backup with the desktop's own code, copies every table into the branch schema in one transaction,
resets sequences, and ends all the branch's sessions. Users, roles and password hashes come
across, so people log in as before.

### 6. Operations

- `docker compose up` brings up PostgreSQL, the app, and a nightly `pg_dump` service with
  14 days of retention.
- Configuration through environment variables (`DATABASE_URL`, `SESSION_SECRET`, `PUBLIC_URL`,
  optional `SMTP_URL`). The server refuses to start in production without a strong secret.
- The fee scheduler runs every hour for every active branch, each in its own context; one
  branch's failure is logged and does not stop the others.
- Exports are written to a private temp folder and downloaded once; uploads are size-limited.

### 7. Security checklist

- `httpOnly`, `SameSite=Strict`, `Secure` (in production) session cookie, bound to one branch;
  sessions stored server-side, revocable, expire after 12 hours idle.
- An `X-Requested-With` header is required on every API call (CSRF); strict CSP; helmet headers.
- Login rate limiting (per IP and per branch + username); bcrypt everywhere.
- Suspending a branch revokes its sessions immediately.
- Audit log of logins, failed logins, invitations, imports, exports and branch status changes.

### 8. Known limits (written down, not discovered)

- No offline mode in the browser: a failed save says so and keeps the form; the desktop app stays
  the offline option.
- No cross-branch (national) reports yet.
- No branch deletion in the console yet: a branch is suspended (typed confirmation), and its data
  stays until an operator drops its schema after an export.
- The platform admin has no access to branch data, by design.

### 9. Acceptance criteria

1. A platform admin creates branch "Sousse" and gets an invitation link.
2. The invitee becomes Superadmin of Sousse, invites a FinanceManager, who accepts.
3. Students, teachers, classes, attendance, a fee payment with receipt, income, expenses,
   inventory, settings and logo all work in the browser, in Arabic, with the desktop pages.
4. Exports (Excel, Word) download in the browser; the Excel import works by upload. (PDF stays
   switched off as on the desktop: see the known limits in [README.md](README.md).)
5. A second branch cannot see anything of the first, including through direct API calls.
6. A desktop `.qdb` backup imports into a branch and its users can log in.
7. Suspending a branch logs its users out.
8. The desktop app's tests still pass.
