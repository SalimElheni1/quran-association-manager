# Branch migrations

Changes to the tables of every branch schema (`branch_<id>`), applied by `npm run migrate`
(and at server start) to each branch, in file-name order, each in its own transaction. Applied
names are recorded in the branch's own `migrations` table, next to the desktop migration names.

When a desktop migration is added to `src/db/migrations/`:

1. Regenerate the schema used for new branches:
   `node web/server/db/generate-branch-schema.js > web/server/db/branch-schema.sql`
2. Add the same change for existing branches here, written for PostgreSQL, named
   `web-NNN-<desktop file name>` (for example `web-001-063-add-something.sql`).

A new branch is created from `branch-schema.sql` and has every file of this folder marked as
applied.
