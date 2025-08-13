# User Schemas and Field Definitions for Quran Branch Manager

This document outlines the detailed schema and field definitions for various user types within the Quran Branch Manager application: Students (categorized by age and gender), Teachers, and Administrative roles (Admin/Super Admin). These definitions are derived from the provided PDF forms, augmented with best practices from general student and teacher information management systems, and tailored for consistent form generation within the application.

Each schema includes a `Field Name`, `Data Type`, `Description`, `Source` (indicating if it's from a PDF, research, or derived), and `Applicability` (specifying which user sub-category it applies to).

## 1. Student Schemas

Student data management is central to the Quran Branch Manager application. To accommodate the diverse needs of different age groups and genders, the student schema is designed with common core fields and specific fields tailored to children, teenagers, and adults. This approach ensures comprehensive data capture while maintaining flexibility for form generation.

### 1.1. Core Student Fields (Applicable to All Students)

These fields are fundamental and apply to all students regardless of age or gender. They form the base of every student record.

| Field Name           | Data Type | Description                                                                                             | Source             | Applicability        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------ | :----------------- | :------------------- |
| `fullName`           | TEXT      | Full name of the student.                                                                               | PDF (Both)         | All Students         |
| `dateOfBirth`        | DATE      | Student's date of birth.                                                                                | PDF (Both)         | All Students         |
| `gender`             | TEXT      | Student's gender (e.g., 'Male', 'Female').                                                              | Derived            | All Students         |
| `address`            | TEXT      | Student's residential address.                                                                          | PDF (Both)         | All Students         |
| `phoneNumber`        | TEXT      | Student's primary contact phone number.                                                                 | PDF (Both)         | All Students         |
| `email`              | TEXT      | Student's email address.                                                                                | PDF (Both)         | All Students         |
| `enrollmentDate`     | DATE      | Date when the student was officially enrolled in the association.                                       | Research           | All Students         |
| `status`             | TEXT      | Current status of the student (e.g., 'Active', 'Inactive', 'Graduated', 'On Leave').                    | Research           | All Students         |
| `branchId`           | INTEGER   | Foreign key linking to the `branches` table, indicating the student's associated branch.                | Derived (DB Schema)| All Students         |
| `memorizationLevel`  | TEXT      | Current level of Quran memorization (e.g., 'Juz Amma', 'Half Quran', 'Full Quran', 'Specific Surahs'). | PDF (Adult)        | All Students         |
| `notes`              | TEXT      | Any additional notes or remarks about the student.                                                      | Research           | All Students         |

### 1.2. Student Fields by Category

#### 1.2.1. Kids (Ages ~4-12)

This category focuses on younger students, where parental involvement is high. The fields reflect the need for guardian information.

| Field Name           | Data Type | Description                                                                                             | Source             | Applicability        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------ | :----------------- | :------------------- |
| `guardianName`       | TEXT      | Full name of the primary guardian/parent.                                                               | PDF (Children)     | Kids                 |
| `guardianRelation`   | TEXT      | Relationship of the guardian to the child (e.g., 'Father', 'Mother', 'Grandparent').                    | Research           | Kids                 |
| `guardianPhoneNumber`| TEXT      | Guardian's contact phone number.                                                                        | PDF (Children)     | Kids                 |
| `guardianEmail`      | TEXT      | Guardian's email address.                                                                               | Research           | Kids                 |
| `emergencyContactName`| TEXT      | Name of an emergency contact person.                                                                    | Research           | Kids                 |
| `emergencyContactPhone`| TEXT      | Phone number of the emergency contact.                                                                  | Research           | Kids                 |
| `healthConditions`   | TEXT      | Any relevant health conditions or allergies.                                                            | Research           | Kids                 |

#### 1.2.2. Teens (Ages ~13-18)

Teenagers might have more independence but still require guardian oversight. The `nationalId` field becomes relevant here, though it might be optional.

| Field Name           | Data Type | Description                                                                                             | Source             | Applicability        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------ | :----------------- | :------------------- |
| `nationalId`         | TEXT      | National Identity Card (CIN) number. **Optional for some teens.**                                       | PDF (Adult)        | Teens, Adults        |
| `guardianName`       | TEXT      | Full name of the primary guardian/parent (still relevant for legal purposes).                           | Derived            | Teens                |
| `guardianPhoneNumber`| TEXT      | Guardian's contact phone number.                                                                        | Derived            | Teens                |
| `schoolName`         | TEXT      | Name of the school the teen attends.                                                                    | Research           | Teens                |
| `gradeLevel`         | TEXT      | Current grade or academic level.                                                                        | Research           | Teens                |

#### 1.2.3. Adults (Ages 18+)

Adult students are typically self-reliant. Fields focus on their personal and professional details.

| Field Name           | Data Type | Description                                                                                             | Source             | Applicability        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------ | :----------------- | :------------------- |
| `nationalId`         | TEXT      | National Identity Card (CIN) number.                                                                    | PDF (Adult)        | Teens, Adults        |
| `educationalLevel`   | TEXT      | Highest educational qualification (e.g., 'High School', 'Bachelor', 'Master', 'PhD').                   | PDF (Adult)        | Adults               |
| `occupation`         | TEXT      | Current profession or occupation.                                                                       | PDF (Adult)        | Adults               |

### 1.3. Student Category Logic for Form Generation

When generating forms for students, the application should dynamically adjust fields based on the student's age and potentially gender. A common approach is to use the `dateOfBirth` field to determine the age category.

*   **Kids:** If `age <= 12` (or a similar threshold).
*   **Teens:** If `13 <= age <= 18`.
*   **Adults:** If `age > 18`.

Gender (`Male`/`Female`) will primarily influence UI presentation (e.g., honorifics, specific visual elements) rather than field availability, except for specific gender-segregated programs if applicable (which would be handled by `class` or `program` fields).

## 2. Teacher Schema

The teacher schema focuses on professional qualifications, contact information, and specialization areas relevant to Quranic education. This allows for efficient assignment of teachers to classes based on their expertise.

| Field Name           | Data Type | Description                                                                                             | Source             | Applicability        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------ | :----------------- | :------------------- |
| `fullName`           | TEXT      | Full name of the teacher.                                                                               | Research           | All Teachers         |
| `nationalId`         | TEXT      | National Identity Card (CIN) number.                                                                    | Research           | All Teachers         |
| `phoneNumber`        | TEXT      | Teacher's primary contact phone number.                                                                 | Research           | All Teachers         |
| `email`              | TEXT      | Teacher's email address.                                                                                | Research           | All Teachers         |
| `address`            | TEXT      | Teacher's residential address.                                                                          | Research           | All Teachers         |
| `dateOfBirth`        | DATE      | Teacher's date of birth.                                                                                | Research           | All Teachers         |
| `gender`             | TEXT      | Teacher's gender (e.g., 'Male', 'Female').                                                              | Research           | All Teachers         |
| `educationalLevel`   | TEXT      | Highest educational qualification (e.g., 'Bachelor in Islamic Studies', 'Master in Quranic Sciences').  | PDF (Adult)        | All Teachers         |
| `specialization`     | TEXT      | Area of expertise in Quranic studies (e.g., 'Tajweed', 'Hifz', 'Tafsir', 'Arabic Language').            | PDF (Adult)        | All Teachers         |
| `yearsOfExperience`  | INTEGER   | Number of years teaching experience.                                                                    | Research           | All Teachers         |
| `availability`       | TEXT      | Teacher's general availability (e.g., 'Weekdays Mornings', 'Evenings', 'Full-time').                    | Research           | All Teachers         |
| `assignedBranchId`   | INTEGER   | Foreign key linking to the `branches` table, indicating the teacher's primary assigned branch.          | Derived (DB Schema)| All Teachers         |
| `notes`              | TEXT      | Any additional notes or remarks about the teacher.                                                      | Research           | All Teachers         |

## 3. Admin and Super Admin Schemas

Administrative roles require fields primarily focused on identification, contact, and role assignment within the system. Security and access control are paramount for these roles.

### 3.1. Core Admin/Super Admin Fields

| Field Name           | Data Type | Description                                                                                             | Source             | Applicability        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------ | :----------------- | :------------------- |
| `userId`             | INTEGER   | Unique identifier for the user account (primary key).                                                   | Derived (DB Schema)| All Admins           |
| `username`           | TEXT      | Unique username for login.                                                                              | Derived (DB Schema)| All Admins           |
| `passwordHash`       | TEXT      | Hashed password for secure authentication.                                                              | Derived (DB Schema)| All Admins           |
| `role`               | TEXT      | User's role (e.g., 'Admin', 'Superadmin').                                                              | Derived (DB Schema)| All Admins           |
| `fullName`           | TEXT      | Full name of the administrator.                                                                         | Research           | All Admins           |
| `phoneNumber`        | TEXT      | Administrator's contact phone number.                                                                   | Research           | All Admins           |
| `email`              | TEXT      | Administrator's email address.                                                                          | Research           | All Admins           |
| `nationalId`         | TEXT      | National Identity Card (CIN) number.                                                                    | Research           | All Admins           |
| `assignedBranchId`   | INTEGER   | Foreign key linking to the `branches` table, indicating the admin's primary assigned branch (if applicable).| Derived (DB Schema)| Admin (Branch Admin) |
| `lastLogin`          | DATETIME  | Timestamp of the last successful login.                                                                 | Research           | All Admins           |
| `createdAt`          | DATETIME  | Timestamp when the user account was created.                                                            | Derived (DB Schema)| All Admins           |
| `updatedAt`          | DATETIME  | Timestamp of the last update to the user record.                                                        | Research           | All Admins           |

### 3.2. Role-Specific Considerations

*   **Superadmin:** This role typically has full system access and is not usually tied to a specific `branchId`. The `assignedBranchId` field would be null or irrelevant for a Superadmin.
*   **Branch Admin:** This role is specifically tied to a `branchId`, limiting their scope of management to a particular branch.

## 4. Consistent Form Generation and Categorization

To ensure consistent form generation in the application, the following principles should be applied:

*   **Dynamic Field Rendering:** Forms should be dynamically rendered based on the user type and, for students, their age category. This means that when adding a new student, the application would first ask for `dateOfBirth` (and perhaps `gender`), then dynamically present the relevant fields (`guardianName` for kids, `nationalId` for teens/adults, `occupation` for adults, etc.).
*   **Reusability:** Common fields (like `fullName`, `phoneNumber`, `email`) should be defined once and reused across different user types to ensure consistency in data capture and validation logic.
*   **Validation Rules:** Each field should have associated validation rules (e.g., `phoneNumber` must be numeric, `email` must be a valid email format, `nationalId` must adhere to a specific format and length). These rules should be enforced at the form level (frontend) and the API/database level (backend).
*   **Categorization Fields:** Fields like `gender`, `age`, `educationalLevel`, and `specialization` serve as important categorization fields that can be used for filtering, reporting, and assigning users to specific programs or classes. These should often be implemented as dropdowns or selection lists in the UI to ensure data consistency.
*   **Data Integrity:** Ensure that foreign key relationships (e.g., `branchId`, `assignedBranchId`) are properly enforced to maintain data integrity across related tables.

By adhering to these structured schemas and form generation principles, the Quran Branch Manager application can efficiently manage diverse user data, provide a tailored user experience during data entry, and support robust reporting and analysis capabilities.

---

*Authored by Manus AI*

