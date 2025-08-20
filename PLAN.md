# PLAN.md: Attendance Feature Redesign

This document outlines the plan to review, redesign, and implement improvements to the Attendance Registration feature of the Quran Branch Manager Electron desktop app.

## 1. Current vs. Desired Behavior

### Current Behavior
- The user selects a "class" (seance).
- A list of students for that class is displayed.
- The user can mark attendance (present, absent, late) for the **current day only**.
- A "Save" button writes the attendance records to a single `attendance` table, overwriting any existing records for that class and date.
- There is no way to view or edit attendance for past or future dates.
- There is no list of saved attendance sessions.

### Desired Behavior
- **"Attendance Sheet" Model**: The core concept will be an "attendance sheet" uniquely identified by a `(seance_id, date)` pair.
- **Date and Seance Selection**: The UI will feature a date picker and a seance selector. Selecting a combination will load an existing sheet or create a new, unsaved one.
- **Save/Update Logic**:
    - If a sheet for the selected `(seance_id, date)` does not exist, a "Save" button will be shown. Clicking it creates a new sheet and its associated attendance entries.
    - If a sheet exists, an "Update" button will be shown. Clicking it updates the existing records.
    - If the user changes the date or seance after loading a sheet, the context switches to a new, unsaved sheet, preventing accidental overwrites. A hint will notify the user of this change.
- **Saved Records Management**: A new panel or page will list all previously saved attendance sheets, with filtering options (by seance, date range). Selecting a record from this list will load it into the main grid for editing.
- **Robust Persistence**: Data will be stored in a header/detail model using two new tables: `attendance_sheets` and `attendance_entries`, ensuring data integrity with transactions.

## 2. Adopted Pattern & Rationale

- **Pattern**: We will implement a **header/detail** (or master/detail) data model.
    - `attendance_sheets` (header): Stores one record per `(seance_id, date)`, representing a single attendance session.
    - `attendance_entries` (detail): Stores individual student attendance statuses for a given sheet.
- **Rationale**:
    - **Data Integrity**: This model enforces the "one sheet per seance per day" rule at the database level with a unique constraint.
    - **Scalability & Performance**: It's more efficient to query for a list of saved sheets (the small header table) than to scan the entire, potentially massive, flat attendance table.
    - **Extensibility**: It's easier to add metadata to the "sheet" (like `created_by`, `last_updated`, notes for the whole session) without cluttering the individual entry records.
    - **Transactional Integrity**: Creating/updating a sheet and its entries can be wrapped in a single transaction, preventing partial data writes.

## 3. Minimal Changes & Migration Plan

### Database Migration
1.  **Create New Tables**:
    - `attendance_sheets(id, seance_id, date, created_at, updated_at)` with a `UNIQUE(seance_id, date)` constraint.
    - `attendance_entries(id, sheet_id, student_id, status, note)`.
2.  **Data Migration (Optional but Recommended)**:
    - A migration script will be written to read the data from the old `attendance` table, group records by `(class_id, date)` to create new `attendance_sheets`, and then insert the corresponding `attendance_entries` linked to the new sheets.
3.  **Drop Old Table**: The old `attendance` table will be dropped after the data migration is complete.
4.  **Indexes**: Add indexes on `attendance_sheets(seance_id)`, `attendance_sheets(date)`, and `attendance_entries(sheet_id)` for fast lookups.

### Code Changes
- **Backend**:
    - Create new IPC handlers for CRUD operations on attendance sheets (`createSheet`, `updateSheet`, `getSheet`, `listSheets`).
    - Remove old attendance IPC handlers.
    - All database writes will be wrapped in transactions.
- **Frontend**:
    - Rework the `AttendancePage.jsx` component to include a date picker and the new save/update/load logic.
    - Create a new component for the "Saved Records" list.
    - Update API calls to use the new IPC handlers.

## 4. UX Layout, Validation, and Performance

### UX Layout (RTL)
- The layout will be RTL-first.
- **Top Controls**: Seance selector (dropdown) and Date picker will be at the top of the page.
- **Attendance Grid**: A simple grid with `Student Name` and `Status` columns. Status will be a toggle (e.g., Present/Absent buttons).
- **Saved Records**: A side panel or a list view with columns: `Seance Name`, `Date`, `Last Updated`.
- **Labels and Dates**: All labels will be in Arabic, and dates will be localized.

### Validation Rules
- **Backend**:
    - The main process will validate all incoming IPC payloads.
    - A `UNIQUE` constraint on `(seance_id, date)` will be enforced by the database.
- **Frontend**:
    - The UI will prevent saving if no seance or date is selected.
    - A "dirty state" will be tracked to prompt the user before navigating away from an unsaved sheet.

### Performance Approach
- **Virtualized List**: For classes with a large number of students, the attendance grid will use a virtualized list (e.g., `react-window`) to only render visible rows, keeping the UI responsive.
- **Batched Writes**: The `createSheet` and `updateSheet` operations will batch all database inserts/updates into a single transaction to minimize I/O overhead.
- **Debounced Updates**: User interactions (like toggling status) will update the local state instantly, but any potential auto-save logic (if implemented) would be debounced.
- **Memoization**: React components (especially grid rows) will be memoized to prevent unnecessary re-renders.
- **Efficient Queries**: The backend will use indexed queries to ensure fast data retrieval.
