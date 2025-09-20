# API Reference

This document provides a comprehensive reference for all IPC (Inter-Process Communication) channels available in the Quran Branch Manager application. These channels facilitate secure communication between the Electron main process and the renderer process.

## Table of Contents

- [Authentication APIs](#authentication-apis)
- [Student Management APIs](#student-management-apis)
- [Teacher Management APIs](#teacher-management-apis)
- [Class Management APIs](#class-management-apis)
- [User Management APIs](#user-management-apis)
- [Attendance APIs](#attendance-apis)
- [Financial APIs](#financial-apis)
- [Settings APIs](#settings-apis)
- [System APIs](#system-apis)
- [Export/Import APIs](#exportimport-apis)

## Authentication APIs

### `auth:login`
Authenticates a user with username and password.

**Parameters:**
- `credentials` (Object)
  - `username` (string): The username
  - `password` (string): The password

**Returns:** `Promise<Object>`
- `success` (boolean): Authentication success status
- `token` (string): JWT token if successful
- `user` (Object): User information if successful
- `message` (string): Error message if failed

**Example:**
```javascript
const result = await window.electronAPI.login({
  username: 'superadmin',
  password: 'password123'
});
```

### `auth:getProfile`
Retrieves the current user's profile information.

**Parameters:**
- `data` (Object, optional)
  - `token` (string): JWT token (defaults to localStorage token)

**Returns:** `Promise<Object>`
- User profile object or error response

### `auth:updateProfile`
Updates the current user's profile information.

**Parameters:**
- `data` (Object)
  - `token` (string): JWT token
  - Profile fields to update

**Returns:** `Promise<Object>`
- Update result

### `auth:updatePassword`
Updates the current user's password.

**Parameters:**
- `data` (Object)
  - `token` (string): JWT token
  - `currentPassword` (string): Current password for verification
  - `newPassword` (string): New password

**Returns:** `Promise<Object>`
- Update result

## Student Management APIs

### `students:get`
Retrieves students with optional filtering.

**Parameters:**
- `filters` (Object, optional)
  - `searchTerm` (string): Search term for name or matricule
  - `genderFilter` (string): Gender filter ('male', 'female', 'all')
  - `minAgeFilter` (number): Minimum age filter
  - `maxAgeFilter` (number): Maximum age filter

**Returns:** `Promise<Array>`
- Array of student objects with basic information

### `students:getById`
Retrieves a specific student by ID.

**Parameters:**
- `id` (number): The student ID

**Returns:** `Promise<Object|null>`
- Complete student object or null if not found

### `students:add`
Adds a new student to the database.

**Parameters:**
- `studentData` (Object)
  - `name` (string, required): Student's full name
  - `email` (string, optional): Student's email address
  - `contact_info` (string, optional): Contact information
  - `parent_name` (string, optional): Parent/guardian name
  - `memorization_level` (string, optional): Current memorization level
  - `groupIds` (Array<number>, optional): Array of group IDs to assign student to

**Returns:** `Promise<Object>`
- Database result with new student ID

### `students:update`
Updates an existing student's information.

**Parameters:**
- `id` (number): The student ID to update
- `studentData` (Object): Updated student information

**Returns:** `Promise<Object>`
- Update result

### `students:delete`
Deletes a student from the database.

**Parameters:**
- `id` (number): The student ID to delete

**Returns:** `Promise<Object>`
- Deletion result

## Teacher Management APIs

### `teachers:get`
Retrieves teachers with optional filtering.

**Parameters:**
- `filters` (Object, optional): Filter criteria

**Returns:** `Promise<Array>`
- Array of teacher objects

### `teachers:getById`
Retrieves a specific teacher by ID.

**Parameters:**
- `id` (number): The teacher ID

**Returns:** `Promise<Object|null>`
- Teacher object or null if not found

### `teachers:add`
Adds a new teacher to the database.

**Parameters:**
- `teacherData` (Object): Teacher information

**Returns:** `Promise<Object>`
- Database result with new teacher ID

### `teachers:update`
Updates an existing teacher's information.

**Parameters:**
- `id` (number): The teacher ID to update
- `teacherData` (Object): Updated teacher information

**Returns:** `Promise<Object>`
- Update result

### `teachers:delete`
Deletes a teacher from the database.

**Parameters:**
- `id` (number): The teacher ID to delete

**Returns:** `Promise<Object>`
- Deletion result

## Class Management APIs

### `classes:get`
Retrieves classes with optional filtering.

**Parameters:**
- `filters` (Object, optional): Filter criteria

**Returns:** `Promise<Array>`
- Array of class objects

### `classes:add`
Adds a new class to the database.

**Parameters:**
- `classData` (Object): Class information

**Returns:** `Promise<Object>`
- Database result with new class ID

### `classes:update`
Updates an existing class's information.

**Parameters:**
- `id` (number): The class ID to update
- `classData` (Object): Updated class information

**Returns:** `Promise<Object>`
- Update result

### `classes:delete`
Deletes a class from the database.

**Parameters:**
- `id` (number): The class ID to delete

**Returns:** `Promise<Object>`
- Deletion result

### `classes:getById`
Retrieves a specific class by ID.

**Parameters:**
- `id` (number): The class ID

**Returns:** `Promise<Object|null>`
- Class object or null if not found

### `classes:getEnrollmentData`
Gets enrollment data for a class.

**Parameters:**
- `data` (Object): Request data

**Returns:** `Promise<Object>`
- Enrollment information

### `classes:updateEnrollments`
Updates student enrollments for a class.

**Parameters:**
- `classId` (number): The class ID
- `studentIds` (Array<number>): Array of student IDs to enroll

**Returns:** `Promise<Object>`
- Update result

## User Management APIs

### `users:get`
Retrieves users with optional filtering.

**Parameters:**
- `filters` (Object, optional): Filter criteria

**Returns:** `Promise<Array>`
- Array of user objects

### `users:add`
Adds a new user to the database.

**Parameters:**
- `userData` (Object): User information

**Returns:** `Promise<Object>`
- Database result with new user ID

### `users:getUserById`
Retrieves a specific user by ID.

**Parameters:**
- `id` (number): The user ID

**Returns:** `Promise<Object|null>`
- User object or null if not found

### `users:update`
Updates an existing user's information.

**Parameters:**
- `id` (number): The user ID to update
- `userData` (Object): Updated user information

**Returns:** `Promise<Object>`
- Update result

### `users:delete`
Deletes a user from the database.

**Parameters:**
- `id` (number): The user ID to delete

**Returns:** `Promise<Object>`
- Deletion result

## Attendance APIs

### `attendance:getClassesForDay`
Gets classes scheduled for a specific day.

**Parameters:**
- `date` (string): Date in YYYY-MM-DD format

**Returns:** `Promise<Array>`
- Array of class objects for the specified day

### `attendance:getStudentsForClass`
Gets students enrolled in a specific class.

**Parameters:**
- `classId` (number): The class ID

**Returns:** `Promise<Array>`
- Array of student objects

### `attendance:getForDate`
Gets attendance records for a specific class and date.

**Parameters:**
- `classId` (number): The class ID
- `date` (string): Date in YYYY-MM-DD format

**Returns:** `Promise<Array>`
- Array of attendance records

### `attendance:save`
Saves attendance records for a class session.

**Parameters:**
- `data` (Object): Attendance data

**Returns:** `Promise<Object>`
- Save result

## Financial APIs

### `get-expenses`
Retrieves all expense records.

**Returns:** `Promise<Array>`
- Array of expense objects

### `add-expense`
Adds a new expense record.

**Parameters:**
- `expense` (Object): Expense information

**Returns:** `Promise<Object>`
- Database result

### `update-expense`
Updates an existing expense record.

**Parameters:**
- `expense` (Object): Updated expense information

**Returns:** `Promise<Object>`
- Update result

### `delete-expense`
Deletes an expense record.

**Parameters:**
- `id` (number): The expense ID to delete

**Returns:** `Promise<Object>`
- Deletion result

### `get-donations`
Retrieves all donation records.

**Returns:** `Promise<Array>`
- Array of donation objects

### `add-donation`
Adds a new donation record.

**Parameters:**
- `donation` (Object): Donation information

**Returns:** `Promise<Object>`
- Database result

### `get-salaries`
Retrieves all salary records.

**Returns:** `Promise<Array>`
- Array of salary objects

### `add-salary`
Adds a new salary record.

**Parameters:**
- `salary` (Object): Salary information

**Returns:** `Promise<Object>`
- Database result

### `get-payments`
Retrieves all payment records.

**Returns:** `Promise<Array>`
- Array of payment objects

### `add-payment`
Adds a new payment record.

**Parameters:**
- `payment` (Object): Payment information

**Returns:** `Promise<Object>`
- Database result

### `get-financial-summary`
Gets financial summary for a specific year.

**Parameters:**
- `year` (number): The year to get summary for

**Returns:** `Promise<Object>`
- Financial summary data

## Settings APIs

### `settings:get`
Retrieves application settings.

**Parameters:**
- `key` (string, optional): Specific setting key

**Returns:** `Promise<Object|string>`
- Settings object or specific setting value

### `settings:update`
Updates application settings.

**Parameters:**
- `settingsData` (Object): Settings to update

**Returns:** `Promise<Object>`
- Update result

### `settings:uploadLogo`
Opens file dialog to upload a logo.

**Returns:** `Promise<Object>`
- Upload result with file path

### `settings:getLogo`
Gets the current logo information.

**Returns:** `Promise<Object>`
- Logo information

## System APIs

### `get-is-packaged`
Checks if the application is running in packaged mode.

**Returns:** `Promise<boolean>`
- True if packaged, false if in development

### `get-app-version`
Gets the current application version.

**Returns:** `Promise<string>`
- Application version string

### `dialog:openDirectory`
Opens a directory selection dialog.

**Returns:** `Promise<Object>`
- Selected directory path

### `backup:run`
Runs a database backup operation.

**Parameters:**
- `settings` (Object): Backup settings

**Returns:** `Promise<Object>`
- Backup result

### `backup:getStatus`
Gets the current backup status.

**Returns:** `Promise<Object>`
- Backup status information

### `db:import`
Imports data from a backup file.

**Parameters:**
- `data` (Object): Import configuration

**Returns:** `Promise<Object>`
- Import result

## Export/Import APIs

### `export:generate`
Generates an export file with specified options.

**Parameters:**
- `options` (Object): Export configuration

**Returns:** `Promise<Object>`
- Export result with file path

### `import:generate-template`
Generates an import template file.

**Returns:** `Promise<Object>`
- Template generation result

### `import:execute`
Executes an import operation.

**Parameters:**
- `args` (Object): Import arguments

**Returns:** `Promise<Object>`
- Import execution result

## Error Handling

All API calls return Promises and may throw errors. It's recommended to wrap API calls in try-catch blocks:

```javascript
try {
  const students = await window.electronAPI.getStudents();
  // Handle success
} catch (error) {
  console.error('Failed to fetch students:', error);
  // Handle error
}
```

## Security Notes

- All API calls go through secure IPC channels
- Authentication is required for most operations
- Input validation is performed on the main process
- SQL injection protection is implemented through parameterized queries
- JWT tokens are used for session management

---

*This documentation is automatically generated and maintained. Last updated: 2025-01-15*