# PLAN.md: Matricule System Implementation

This plan details the steps to implement the matricule system, following the structure provided in the initial request.

### Step 0: Analysis and Design (Completed)

-   [x] Review project documentation, schema, and application code.
-   [x] Analyze database setup (SQLCipher), IPC, and Excel flows.
-   [x] Produce `DESIGN.md` outlining the rationale, risks, and rollout plan.
-   [x] Produce this `PLAN.md`.
-   [ ] **Deliverable**: Commit `PLAN.md` and `DESIGN.md` to the `feat/matricule-system` branch.

---

### Step 1: Database & Migration

1.  **Create Migration File**: Create a new SQL migration file (e.g., `008-add-matricule-column.sql`) in `src/db/migrations/`.
2.  **Update Schema**: In the migration file, add a nullable `matricule TEXT` column to the `students`, `teachers`, and `users` tables.
3.  **Back-populate Matricules**: In the same migration, update existing rows. The `id` will be used to create a deterministic matricule.
    *   `UPDATE students SET matricule = 'S-' || printf('%06d', id);`
    *   `UPDATE teachers SET matricule = 'T-' || printf('%06d', id);`
    *   `UPDATE users SET matricule = 'U-' || printf('%06d', id);`
4.  **Add Constraints**: After populating, alter the tables to enforce `UNIQUE NOT NULL` on the new `matricule` columns. This will likely require recreating the table with the constraints and copying the data, which is the standard way to add constraints to existing tables in SQLite.
5.  **Create Indexes**: Ensure unique indexes are created on the `matricule` columns for `students`, `teachers`, and `users` as part of the constraint addition.

### Step 2: Backend Logic & IPC

1.  **Matricule Generation Service**:
    *   Create a new utility file, e.g., `src/main/matriculeService.js`.
    *   Implement a function `generateMatricule(entityType)` (e.g., `entityType` is 'student', 'teacher', 'user').
    *   This function will query the database for the highest existing matricule number for that type, increment it, and return the new matricule string (e.g., `S-000042`).
2.  **Update `add` handlers**:
    *   In `studentHandlers.js`, `teacherHandlers.js`, `userHandlers.js`, modify the `*:add` functions.
    *   Before inserting a new record, call `generateMatricule` to get the new matricule.
    *   Add the `matricule` to the `INSERT` statement.
3.  **Update `update` handlers**:
    *   Ensure the `matricule` field is not present in the `UPDATE` statements in the `*:update` handlers to enforce immutability.
4.  **Update Excel Import Logic (`importManager.js`)**:
    *   Modify `processStudentRow`, `processTeacherRow`, and `processUserRow`.
    *   Add logic to read the `matricule` from the Excel row.
    *   If `matricule` exists: `UPDATE` the record where `matricule` matches. If no match, log an error.
    *   If `matricule` is missing: call `generateMatricule` and `INSERT` a new record.
5.  **Update Excel Export Logic (`exportManager.js`)**:
    *   Add `matricule` to the list of fields that can be exported for students, teachers, and users.
    *   Add the `matricule` column (`الرقم التعريفي`) to the generated Excel templates in `generateExcelTemplate`.

### Step 3: Frontend/UI

1.  **Display Matricule**:
    *   In `StudentsPage.jsx`, `TeachersPage.jsx`, `UsersPage.jsx`, add a "Matricule" column to the main tables.
    *   In `StudentDetailsModal.jsx`, `TeacherDetailsModal.jsx`, etc., display the matricule.
2.  **Read-Only Forms**:
    *   In `StudentFormModal.jsx`, `TeacherFormModal.jsx`, etc., add a `matricule` field but make it `disabled` or `readOnly`.
3.  **Enable Search**:
    *   Update the `students:get` (and others) IPC handler to accept a search term that can also query the `matricule` column.
    *   Update the frontend search components to use this.

### Step 4: Excel Templates & Docs

1.  **Update Excel Template**: This is covered in Step 2, but double-check that `generateExcelTemplate` in `exportManager.js` now includes the `Matricule` column with the correct Arabic header (`الرقم التعريفي`) and a warning not to edit it.

### Step 5: Testing & Validation

1.  **Unit Tests**: Write unit tests for `matriculeService.js`.
2.  **Integration Tests**:
    *   Test the `students:add` flow to ensure a matricule is generated.
    *   Test the Excel import/export round-trip.
3.  **E2E Tests**: Manually test the UI flow for search, display, and form interactions related to the matricule.
