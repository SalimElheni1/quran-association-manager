# Money Management Feature Ideas Report

**Authored by:** Jules, Product Strategist & Senior Technical Architect
**Date:** 2025-08-18
**Version:** 1.0

## 1. High-Level Purpose

The introduction of a Money Management module aims to address a critical administrative need for Quranic branch associations: the transparent and efficient handling of finances. Currently, these processes are likely manual, leading to potential errors, lack of transparency, and significant administrative overhead.

This module will empower branch administrators to:
- **Centralize Financial Records:** Move away from scattered spreadsheets and paper records to a single, secure source of truth within the existing application.
- **Enhance Transparency:** Provide clear, auditable records of all financial activities for internal management and association leadership.
- **Streamline Operations:** Simplify the tracking of student fees, teacher payments, donations, and operational expenses.
- **Improve Decision-Making:** Generate financial reports that offer insights into the branch's financial health, aiding in budgeting and resource allocation.

## 2. Core Functions (MVP)

The first version (MVP) should focus on delivering the most critical financial tracking capabilities.

- **Track Student Tuition:** Record tuition payments from students and link them to the student's record.
- **Track Teacher Payments:** Record salary or stipend payments made to teachers and link them to the teacher's record.
- **Manage Donations:** Record incoming donations, whether from students, parents, or external donors.
- **Manage Expenses:** Track operational expenses such as rent, utilities (water, electricity), supplies (books, stationery), and other miscellaneous costs.
- **Generate Receipts:** Produce simple, printable PDF receipts for individual transactions, especially for student tuition payments.
- **Basic Financial Overview:** View a simple list of all transactions with the ability to see a running balance.

## 3. Entities & Data Model

To support these functions, the following additions to the SQLite database are proposed. This design respects the existing offline-first, local SQLite architecture.

### New Table: `transactions`

This will be the central table for all financial records. A single entry will represent any movement of money (income or expense).

| Column Name     | Data Type     | Constraints                                           | Description                                                                                                                                                             |
|:----------------|:--------------|:------------------------------------------------------|:------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `id`            | `INTEGER`     | `PRIMARY KEY AUTOINCREMENT`                           | Unique identifier for each transaction.                                                                                                                                 |
| `branch_id`     | `INTEGER`     | `NOT NULL, FOREIGN KEY REFERENCES branches(id)`       | Links the transaction to a specific branch, ensuring data segregation.                                                                                                  |
| `type`          | `TEXT`        | `NOT NULL`                                            | The nature of the transaction. Expected values: 'income', 'expense'.                                                                                                    |
| `category`      | `TEXT`        | `NOT NULL`                                            | A more specific category. For 'income': 'tuition', 'donation'. For 'expense': 'salary', 'rent', 'utilities', 'supplies', 'other'.                                       |
| `amount`        | `DECIMAL(10,2)`| `NOT NULL`                                            | The monetary value of the transaction. Stored as a decimal to handle currency values accurately.                                                                        |
| `transaction_date`| `DATETIME`    | `NOT NULL`                                            | The date the transaction occurred. Should be user-editable.                                                                                                             |
| `description`   | `TEXT`        |                                                       | An optional, user-provided description for more details about the transaction.                                                                                          |
| `student_id`    | `INTEGER`     | `FOREIGN KEY REFERENCES students(id), NULLABLE`       | Links the transaction to a student (e.g., for tuition payments).                                                                                                        |
| `teacher_id`    | `INTEGER`     | `FOREIGN KEY REFERENCES teachers(id), NULLABLE`       | Links the transaction to a teacher (e.g., for salary payments).                                                                                                         |
| `recorded_by_user_id`| `INTEGER`| `NOT NULL, FOREIGN KEY REFERENCES users(id)`          | The ID of the user who recorded the transaction, for audit purposes.                                                                                                    |
| `created_at`    | `DATETIME`    | `DEFAULT CURRENT_TIMESTAMP`                           | The timestamp when the record was created in the database.                                                                                                              |

## 4. User Roles & Permissions

Based on the database schema and your feedback, the permissions will be assigned to the correct roles. The application is only for administrators, so teachers will not have access.

- **Superadmin:**
    - **Permissions:** Has full, unrestricted CRUD access to all financial records across **all branches**, identical to their access in other modules.
- **FinanceManager:**
    - **Permissions:** Has full CRUD access to all financial records across **all branches**. This role is dedicated to financial management.
    - **Capabilities:** Can perform all financial operations, generate all reports, and manage financial settings.
- **Admin (Branch Admin):**
    - **Permissions:** Highly restricted. Can **only create** new 'income' transactions (e.g., student tuition payments).
    - **Capabilities:** This role is for data entry of incoming funds only. They **cannot** view the transaction log, generate reports, or see any financial summaries or balances. This ensures a strict separation of duties.

## 5. UI Ideas

The UI must adhere to the established Arabic RTL layout and be intuitive for non-technical users.

- **New "Financials" Tab:** A new top-level item in the main navigation sidebar, possibly with an icon like `fas fa-coins`.
- **Financial Dashboard:** Upon entering the tab, the user sees a dashboard with key metrics:
    - **Cards:** "Current Balance", "Total Income (This Month)", "Total Expenses (This Month)".
- **Transactions Log:**
    - A comprehensive, paginated table showing all transactions.
    - **Columns:** Date, Type, Category, Amount, Description, Linked To (Student/Teacher Name).
    - **Filtering:** Powerful filters at the top of the table to search by date range, type, and category.
- **"New Transaction" Forms:**
    - A prominent button to "Add New Transaction" which opens a modal or a new page.
    - The form would first ask for **Type** ('Income' or 'Expense').
    - Based on the type, the **Category** dropdown changes.
    - If `Category` is 'Tuition', a searchable dropdown of **Students** appears.
    - If `Category` is 'Salary', a searchable dropdown of **Teachers** appears.
    - The UI should be clean, simple, and guide the user through the process.

## 6. Reports & Exports

Reports should be generated via the secure main process and exported in common formats.

- **Payment Receipt (PDF):**
    - **Trigger:** A "Print Receipt" button next to any 'tuition' transaction.
    - **Content:** Association Logo, Branch Name, "Official Receipt" title, Student Name, Amount Paid, Date, and a unique Transaction ID.
- **Monthly/Yearly Financial Summary (PDF & Excel):**
    - **Input:** User selects a date range (e.g., a specific month or year).
    - **Content:** A summary report showing:
        - Total Income (broken down by category: Tuition, Donations)
        - Total Expenses (broken down by category: Salaries, Rent, etc.)
        - Net Profit/Loss
    - The Excel export would contain the raw transaction data for the selected period.

## 7. Risk & Security Considerations

Financial data requires the highest level of security and integrity.

- **Data Sensitivity:** All financial data must be treated as highly sensitive. Access must be strictly controlled via the role-based permissions outlined above.
- **Access Control:** All IPC calls related to financials must be rigorously checked in the main process to ensure the user has the correct role and branch permissions before executing any database query.
- **Data Integrity:** Use database transactions (e.g., `BEGIN TRANSACTION; ... COMMIT;`) for all write operations to ensure that data is saved atomically and stays consistent.
- **Backup & Recovery:** The application should prominently feature and encourage the use of a database backup function. With financial data, the ability to restore from a backup is critical.
- **Audit Trail (Future):** While not in the MVP, logging all changes to financial records (who, what, when) is a crucial future extension for accountability. The `recorded_by_user_id` is the first step.

## 8. Performance Notes

The module must not degrade the application's lightweight performance.

- **Database Indexing:** The `transactions` table must be indexed on frequently queried columns: `branch_id`, `type`, `category`, `transaction_date`, `student_id`, `teacher_id`. This will ensure that filtering and report generation remain fast as data grows.
- **Efficient Queries:** Financial calculations (e.g., summing totals) should be performed within the database using SQL aggregate functions (`SUM`, `GROUP BY`). Avoid pulling large raw datasets into the renderer process for calculation.
- **Pagination:** The main transaction log must be paginated. Do not attempt to load thousands of transactions into the UI at once. Fetch data in manageable chunks (e.g., 50 records per page).

## 9. Future Extensions

Beyond the MVP, the module can be expanded to become a comprehensive financial management tool.

- **Budgeting Module:** Allow admins to set budgets for different expense categories and track spending against them.
- **Charts & Visualizations:** Add a "Dashboard" or "Analytics" sub-tab with visual charts (e.g., pie charts for income/expense breakdowns, line charts for financial trends over time).
- **Recurring Transactions:** Set up recurring transactions for fixed monthly expenses like rent or salaries.
- **Full Audit Logs:** Implement a separate `audit_log` table that records every change to the `transactions` table for complete traceability.
- **Multi-Branch Consolidated Reports:** For Superadmins, provide reports that consolidate financial data from all branches into a single view.
- **Online Syncing:** For versions of the app that may connect to the internet, develop a secure mechanism to sync local financial data with a central server.

---

## 10. Prioritized Roadmap

This roadmap breaks down the development of the Money Management module into logical phases.

### Phase 1: Core MVP

The goal of this phase is to deliver the essential functionality for tracking and recording financial transactions.

1.  **Database:** Implement the `transactions` table in the database schema.
2.  **Backend:** Create secure IPC handlers in the main process for full CRUD operations on transactions, strictly enforcing branch-level access.
3.  **UI - Transaction Log:** Build the main transaction log view with pagination and basic filtering (by date range).
4.  **UI - Forms:** Create the forms for adding/editing income (Tuition, Donation) and expense (Salary, General) transactions, with dynamic fields for linking to students/teachers.
5.  **Reporting:** Implement the simple PDF Payment Receipt generation.
6.  **Permissions:** Implement the permission system for the `Superadmin`, `FinanceManager`, and the restricted `Admin` (Branch Admin) roles.

### Phase 2: Reporting & Usability Enhancements

This phase builds on the MVP to provide better insights and user experience.

1.  **UI - Dashboard:** Implement the financial dashboard with key metrics (Current Balance, Monthly Income/Expense).
2.  **Reporting:** Build the Monthly/Yearly Financial Summary reports (PDF and Excel).
3.  **UI - Advanced Filters:** Enhance the transaction log with more powerful filtering (by category, linked person).

### Phase 3: Advanced Features (Future)

These features can be developed later based on user feedback and needs.

1.  **Analytics:** Introduce charts and visualizations.
2.  **Budgeting:** Build the budgeting module.
3.  **Audit Trail:** Implement a full, user-visible audit log.
4.  **Consolidation:** Develop consolidated reporting for Superadmins.
