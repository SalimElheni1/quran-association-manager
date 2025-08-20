### Plan: Overhaul the Attendance Registration Feature

This plan outlines the steps to re-implement the attendance feature in the Quran Branch Manager application, following the detailed requirements. The work will be done on the `feat/attendance-sheets` branch.

**Guiding Principles:**
- **Incremental Commits:** Each step will correspond to one or more logical commits.
- **App Stability:** The application will remain buildable and runnable after each step.
- **Adherence to Guardrails:** All changes will comply with the project's linting, building, and testing standards.

---

#### **Phase 1: Backend and Data Model**

1.  **Create `PLAN.md` file:** I will create a `PLAN.md` file to have a clear reference for the implementation.
2.  **Database Schema Migration:**
    -   Create a new database migration file.
    -   Define the `attendance_sheets` table:
        -   `id` (PK)
        -   `seance_id` (FK to `classes.id`, which represents a seance/class)
        -   `date` (TEXT, ISO 8601 format 'YYYY-MM-DD')
        -   `notes` (TEXT, optional)
        -   `created_at`, `updated_at`
        -   Add a `UNIQUE` constraint on `(seance_id, date)`.
    -   Define the `attendance_entries` table:
        -   `id` (PK)
        -   `sheet_id` (FK to `attendance_sheets.id`)
        -   `student_id` (FK to `students.id`)
        -   `status` (TEXT: 'present', 'absent', 'late', 'excused')
        -   `notes` (TEXT, optional, for absence reasons)
        -   Add a `UNIQUE` constraint on `(sheet_id, student_id)`.
    -   I will not delete the old `attendance` table yet to maintain app stability until the new feature is fully integrated.

3.  **Implement New IPC Handlers (Main Process):**
    -   `attendance-sheets:get`: Fetch a list of saved attendance sheets, with filters for seance, date range, etc.
    -   `attendance-sheets:get-one`: Fetch a single attendance sheet and its corresponding entries by `(seance_id, date)`.
    -   `attendance-sheets:create`: Create a new attendance sheet and its entries in a single transaction. This will handle the initial "Save" action.
    -   `attendance-sheets:update`: Update an existing attendance sheet and its entries in a single transaction. This will handle subsequent "Update" actions.
    -   All handlers will perform data validation using Joi schemas.
    -   I will keep the old `attendance:*` handlers for now to avoid breaking the existing page.

#### **Phase 2: Frontend UI Implementation**

4.  **Create New Attendance Page Component:**
    -   Create a new file `src/renderer/pages/NewAttendancePage.jsx`.
    -   Build the UI with a header containing:
        -   A dropdown to select a "Seance" (from active `classes`).
        -   A date picker (defaulting to today).
        -   A "Load" button.
    -   Changing the seance or date will trigger a fetch for an existing record. The UI will indicate if the record is new or existing.

5.  **Implement Core UI Logic:**
    -   On "Load", the component will call `attendance-sheets:get-one` with the selected seance and date.
    -   If a sheet exists, the student list will be populated with their saved attendance statuses. The "Save" button will read "Update".
    -   If no sheet exists, the student list for the selected seance will be fetched, with a default status ('present'). The button will read "Save".
    -   Implement toggles for student presence ('present', 'absent', 'late', 'excused') and a small text input for absence notes.
    -   The "Save"/"Update" button will call the appropriate IPC handler (`:create` or `:update`) with the full payload.

6.  **Saved Records List:**
    -   Add a component to the page to display a list of recently saved attendance sheets (`attendance-sheets:get`).
    -   This list will have basic filters (by seance, by date).
    -   Clicking an item in the list will load that sheet's data into the main form for viewing or editing.

#### **Phase 3: Integration and Refinement**

7.  **Replace Old Attendance Page:**
    -   Once the new page is stable and functional, I will update the main application routing (in `App.jsx`) to point to `NewAttendancePage.jsx` instead of `AttendancePage.jsx`.
    -   The old `AttendancePage.jsx` file will be kept for now.

8.  **Testing and Validation:**
    -   Write unit tests for the new IPC handlers.
    -   Write integration tests to ensure the frontend and backend communicate correctly.
    -   Manually perform E2E testing of the entire workflow: creating, updating, and loading sheets.
    -   Ensure the UI is fully functional in RTL mode.

9.  **Final Cleanup:**
    -   Remove the old `attendance` table with a new migration.
    -   Remove the old `attendance:*` IPC handlers from `src/main/index.js`.
    -   Delete the old `src/renderer/pages/AttendancePage.jsx` file.
    -   Update `/docs/Technical Documentation_ Quran Branch Manager.md` to reflect the new schema and IPC handlers.

10. **Submit for Review:**
    -   Run `npm run lint` and `npm run build` to ensure all checks pass.
    -   Request a code review before submitting the final pull request.
