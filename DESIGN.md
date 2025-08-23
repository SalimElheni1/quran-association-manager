# DESIGN.md: Matricule System Implementation

This document outlines the design for introducing a unique, system-generated matricule (registration number) for all core entities (students, teachers, users).

## 1. Why a Matricule? (Benefits)

The current system relies on auto-incrementing integer `id`s as primary keys and uses fields like `name` or `national_id` for identification in external systems (like Excel imports). This approach has several drawbacks:

*   **Brittleness**: Names can change or not be unique. `national_id` might not always be available or could be entered incorrectly. Relying on this for data mapping is fragile.
*   **Opacity**: An auto-incrementing `id` like `127` provides no context about the entity it represents.
*   **Insecurity**: Exposing database primary keys to the outside world can be a minor security risk.
*   **Difficulty in Merging/Updates**: Without a stable, unique identifier, updating existing records from an external source (like an Excel file) is difficult and error-prone. The current system only supports adding new records on import.

Introducing a `matricule` addresses these issues:

*   **Reliability**: A unique, system-generated, and immutable `matricule` (e.g., `S-000001`) becomes the single source of truth for identifying an entity across all parts of the application, including exports and imports.
*   **Clarity**: A prefixed format like `S-` for students, `T-` for teachers, and `U-` for users makes the identifier instantly recognizable.
*   **Robust Imports**: It enables a reliable "update-or-create" logic for Excel imports. If a row has a matricule, the system updates the corresponding record. If not, it creates a new one and generates a new matricule.
*   **Improved Search**: Provides a simple, guaranteed-unique value for users to search for specific records.

### Risks

*   **Migration**: The most significant risk is the one-time migration to add the `matricule` column and back-populate it for all existing records. This must be done carefully to ensure data integrity and uniqueness. The process must be idempotent and part of the existing migration framework.
*   **Excel Flow**: The Excel import/export logic needs a major overhaul. This is a high-risk area for bugs if not implemented and tested thoroughly.
*   **User Adoption**: Users must be educated about the new `Matricule` / `الرقم التعريفي` field and its importance, especially in the context of Excel imports.
*   **Performance**: The new `matricule` column must be indexed to ensure fast lookups and avoid performance degradation on `SELECT`, `UPDATE`, and `JOIN` operations.

## 2. Alternatives Considered

| Alternative                 | Pros                                                              | Cons for Our Case                                                                                                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Integer Keys (Current)**  | Simple, fast, automatically handled by the database.              | Not suitable for external systems, opaque, can lead to collisions in distributed scenarios (not a current issue, but a future limitation). Doesn't solve the import/update problem.                                                                                             |
| **UUIDs (v4)**              | Globally unique, no central generator needed. Good for security.  | Long, unreadable (`f47ac10b-58cc-4372-a567-0e02b2c3d479`), not user-friendly for searching or display. Can be slightly less performant as a primary key index compared to sequential identifiers. Overkill for this application's needs.                               |
| **Hashed Composite Keys**   | Could be generated from existing data (e.g., hash of name+DOB).   | Brittle. If the source data changes (e.g., name correction), the key changes, breaking the link. Introduces complexity in ensuring uniqueness and handling collisions. Not a stable identifier.                                                                                  |
| **Prefixed Sequential ID (Proposed)** | **Readable & User-Friendly**: `S-000001` is easy to read, type, and communicate. <br> **Contextual**: The prefix (`S-`, `T-`, `U-`) immediately identifies the entity type. <br> **Sortable**: Lexicographical sorting works as expected. <br> **Solves the import problem perfectly.** | Requires a central service to generate the next sequential number, which can be complex in a highly concurrent system. However, for this offline-first, single-node Electron app, this is a non-issue. The "service" can be a simple transaction in the local SQLite database. |

**Conclusion**: The **Prefixed Sequential ID** is the best fit. It directly addresses the core problems of import/export unreliability and user-facing identification without the complexity or user-unfriendliness of UUIDs.

## 3. Cautions & Mitigations

*   **Backward Compatibility**: The `id` column will remain the internal primary key. All foreign key relationships will continue to use `id`. The `matricule` will be a separate, unique, and indexed column used for external identification and user-facing search. This minimizes the impact on the existing database structure.
*   **Excel Mapping Pitfalls**:
    *   **Mitigation**: The Excel import logic will be rewritten to be `matricule`-aware.
        1.  If `matricule` column exists and has a value: `UPDATE ... WHERE matricule = ?`. If no record matches, report an error.
        2.  If `matricule` column is missing or empty: `INSERT` a new record and generate a new `matricule`.
    *   The Excel template will be updated with a clear warning: "Do not modify this column. Leave empty for new records." (`لا تعدّل هذا العمود. اتركه فارغًا للسجلات الجديدة`).
*   **Duplicate Handling**: The `matricule` column will have a `UNIQUE NOT NULL` constraint at the database level to enforce uniqueness programmatically.
*   **Indexing/Performance**: A `UNIQUE` index will be created on the `matricule` column for each of the three tables (`students`, `teachers`, `users`). This is essential for fast lookups.
*   **Security**: The `matricule` is a public identifier and is safe to expose. The generation logic must be secure against race conditions (though unlikely in this architecture), which can be achieved by using a database transaction.

## 4. Phased Rollout Plan

This will be implemented in a single feature branch (`feat/matricule-system`).

1.  **Phase 1: Database & Migration (The Foundation)**
    *   Create a new migration script.
    *   **Action**: Add `matricule TEXT` to `students`, `teachers`, and `users`, which will be constrained to `UNIQUE NOT NULL` after back-population.
    *   **Action**: Back-populate the `matricule` for all existing records. The generation will be deterministic: `S-` + `printf('%06d', id)`. For example, student with `id=1` gets `S-000001`. This makes the migration predictable and idempotent.
    *   **Acceptance**: Migration runs successfully. All existing users, students, and teachers have a unique matricule.

2.  **Phase 2: Backend Logic (Service & Core Flows)**
    *   **Action**: Create a `MatriculeService` (or similar utility) that can generate the next available matricule for a given entity type (e.g., `S-000002`). This service will find the max existing number and increment it.
    *   **Action**: Update the `*:add` handlers (`students:add`, etc.) to call this service and include the new `matricule` on insert.
    *   **Action**: `matricule` should be disallowed from `*:update` handlers to make it immutable.
    *   **Acceptance**: Creating a new student/teacher/user via the app UI results in a correct matricule being assigned and stored.

3.  **Phase 3: Excel & IPC (The Main User-Facing Change)**
    *   **Action**: Update `exportManager.js` to include `matricule` (`الرقم التعريفي`) in all relevant data exports and in the generated Excel template.
    *   **Action**: Rewrite `importManager.js` to implement the `matricule`-aware update-or-create logic described in section 3.
    *   **Acceptance**: Exported Excel files contain the matricule. Importing a file with matricules updates existing records. Importing a file without matricules creates new records with new matricules.

4.  **Phase 4: Frontend UI**
    *   **Action**: Display `matricule` in lists and detail views for students, teachers, and users.
    *   **Action**: Add the ability to search by `matricule` in the main search bars.
    *   **Action**: Display `matricule` as a read-only field on all forms.
    *   **Acceptance**: The matricule is visible and searchable in the UI.

5.  **Phase 5: Testing & Validation**
    *   **Action**: Add unit tests for the matricule generation service.
    *   **Action**: Add integration tests for the import/export flow (a round-trip test would be ideal).
    *   **Action**: Perform E2E tests for the UI changes.
    *   **Acceptance**: All tests pass.

### Rollback Strategy

*   The entire change will be developed on the `feat/matricule-system` branch. The `main` branch will remain stable.
*   The database migration is the most critical step. Since we are only *adding* a column, a rollback would involve creating a new migration that drops the `matricule` column. The database is backed up before migrations, providing another layer of safety.
*   All code changes are reversible through standard Git practices.
