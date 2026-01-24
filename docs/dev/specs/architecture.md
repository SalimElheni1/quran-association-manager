# Architecture Documentation

This document provides a comprehensive overview of the Quran Branch Manager application architecture, including design patterns, data flow, security considerations, and component relationships.

## Table of Contents

- [Overview](#overview)
- [Application Architecture](#application-architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Data Flow](#data-flow)
- [Security Architecture](#security-architecture)
- [Database Design](#database-design)
- [Component Architecture](#component-architecture)
- [IPC Communication](#ipc-communication)
- [State Management](#state-management)
- [Error Handling](#error-handling)
- [Performance Considerations](#performance-considerations)

## Overview

Quran Branch Manager is a desktop application built using Electron, React, and SQLite. It follows a multi-process architecture with secure IPC communication between the main process (Node.js backend) and renderer processes (React frontend).

### Key Architectural Principles

1. **Security First**: Secure IPC communication with no direct Node.js access from renderer
2. **Offline First**: Local SQLite database with encrypted storage
3. **Modular Design**: Feature-based organization with clear separation of concerns
4. **Scalability**: Designed for future web-based expansion
5. **Maintainability**: Comprehensive documentation and testing

## Application Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Application                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐              ┌─────────────────────┐   │
│  │  Renderer       │    Secure    │  Main Process       │   │
│  │  Process        │◄────IPC─────►│  (Node.js)          │   │
│  │  (React App)    │              │                     │   │
│  └─────────────────┘              └─────────────────────┘   │
│           │                                   │             │
│           │                                   │             │
│  ┌─────────────────┐              ┌─────────────────────┐   │
│  │  UI Components  │              │  Business Logic     │   │
│  │  - Pages        │              │  - Handlers         │   │
│  │  - Components   │              │  - Services         │   │
│  │  - Layouts      │              │  - Validation       │   │
│  └─────────────────┘              └─────────────────────┘   │
│           │                                   │             │
│           │                                   │             │
│  ┌─────────────────┐              ┌─────────────────────┐   │
│  │  State Mgmt     │              │  Data Layer         │   │
│  │  - Context API  │              │  - Database         │   │
│  │  - Local State  │              │  - Migrations       │   │
│  └─────────────────┘              │  - Encryption       │   │
│                                   └─────────────────────┘   │
│                                            │                │
│                                   ┌─────────────────────┐   │
│                                   │  SQLCipher Database │   │
│                                   │  (Encrypted SQLite) │   │
│                                   └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend (Renderer Process)
- **React 19.0.0**: UI library for building user interfaces
- **React Router DOM**: Client-side routing
- **Bootstrap 5.3.3**: CSS framework with RTL support
- **React Bootstrap**: Bootstrap components for React
- **Vite 5.4.0**: Build tool and development server
- **React Toastify**: Toast notifications

### Backend (Main Process)
- **Electron 32.0.0**: Desktop application framework
- **Node.js 22.x**: JavaScript runtime
- **SQLCipher**: Encrypted SQLite database
- **bcryptjs**: Password hashing
- **jsonwebtoken**: JWT authentication
- **Joi**: Data validation

### Development Tools
- **Jest**: Testing framework
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Electron Builder**: Application packaging

## Project Structure

```
quran-association-manager/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── handlers/           # IPC request handlers
│   │   │   ├── authHandlers.js
│   │   │   ├── studentHandlers.js
│   │   │   ├── teacherHandlers.js
│   │   │   └── ...
│   │   ├── index.js            # Main entry point
│   │   ├── preload.js          # Secure IPC bridge
│   │   ├── logger.js           # Logging utilities
│   │   ├── keyManager.js       # Encryption key management
│   │   └── validationSchemas.js # Data validation
│   │
│   ├── renderer/               # React frontend
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/             # Page components
│   │   ├── layouts/           # Layout components
│   │   ├── contexts/          # React contexts
│   │   ├── utils/             # Utility functions
│   │   ├── styles/            # CSS files
│   │   └── App.jsx            # Main React component
│   │
│   └── db/                    # Database layer
│       ├── db.js              # Database connection & operations
│       ├── schema.js          # Database schema
│       └── migrations/        # Schema migration files
│
├── docs/                      # Documentation
├── tests/                     # Test files
├── public/                    # Static assets
└── release/                   # Built application files
```

## Data Flow

### 1. User Interaction Flow
```
User Action → React Component → IPC Call → Main Process Handler → Database → Response → UI Update
```

### 2. Authentication Flow
```
Login Form → auth:login IPC → Validate Credentials → Generate JWT → Store Token → Redirect to Dashboard
```

### 3. Data Management Flow
```
CRUD Operation → Validation → Database Transaction → Success/Error Response → UI Feedback
```

## Security Architecture

### 1. Process Isolation
- **Main Process**: Has full Node.js API access, handles sensitive operations
- **Renderer Process**: Sandboxed, no direct Node.js access
- **Preload Script**: Secure bridge using contextBridge

### 2. Database Security
- **Encryption**: SQLCipher with AES-256 encryption
- **Key Management**: Secure key generation and storage
- **SQL Injection Protection**: Parameterized queries only

### 3. Authentication & Authorization
- **JWT Tokens**: Stateless authentication
- **Password Hashing**: bcrypt with salt rounds
- **Role-Based Access**: Different permission levels

### 4. IPC Security
```javascript
// Secure IPC pattern
contextBridge.exposeInMainWorld('electronAPI', {
  // Only expose specific, controlled functions
  getStudents: (filters) => ipcRenderer.invoke('students:get', filters)
});
```

## Database Design

### Entity Relationship Overview
```
Users ──┐
        ├── Authentication & Authorization
        └── Profile Management

Students ──┐
           ├── Personal Information
           ├── Academic Progress
           └── Group Assignments

Teachers ──┐
           ├── Professional Information
           └── Class Assignments

Classes ──┐
          ├── Scheduling
          ├── Student Enrollment
          └── Attendance Tracking

Financial ──┐
            ├── Payments (Student Fees)
            ├── Salaries (Teacher Pay)
            ├── Donations
            └── Expenses
```

### Key Design Patterns
1. **Matricule System**: Unique identifiers for all entities (S-000001, T-000001, U-000001)
2. **Soft Deletes**: Status fields instead of hard deletes
3. **Audit Trail**: Created/updated timestamps
4. **Referential Integrity**: Foreign key constraints with cascading

## Component Architecture

### 1. Page Components
- **Purpose**: Top-level route components
- **Responsibilities**: Data fetching, state management, layout
- **Examples**: `StudentsPage`, `DashboardPage`, `FinancialsPage`

### 2. Layout Components
- **Purpose**: Consistent page structure
- **Responsibilities**: Navigation, sidebar, header
- **Examples**: `MainLayout`, `AuthLayout`

### 3. Feature Components
- **Purpose**: Specific functionality
- **Responsibilities**: Forms, modals, tables
- **Examples**: `StudentFormModal`, `AttendanceTable`, `FinancialChart`

### 4. Utility Components
- **Purpose**: Reusable UI elements
- **Responsibilities**: Common patterns, styling
- **Examples**: `ConfirmationModal`, `StatCard`, `ProtectedRoute`

## IPC Communication

### Channel Naming Convention
```
<feature>:<action>
Examples:
- students:get
- students:add
- auth:login
- settings:update
```

### Handler Pattern
```javascript
// Handler registration
function registerStudentHandlers() {
  ipcMain.handle('students:get', async (event, filters) => {
    // Validation
    // Database operation
    // Error handling
    // Return result
  });
}

// Frontend usage
const students = await window.electronAPI.getStudents(filters);
```

## State Management

### 1. Global State (React Context)
- **AuthContext**: User authentication state
- **SettingsContext**: Application settings
- **ThemeContext**: UI theme preferences

### 2. Local State (useState/useReducer)
- **Component State**: Form data, UI state
- **Page State**: Data fetching, loading states

### 3. Server State
- **Database**: Single source of truth
- **Caching**: Minimal client-side caching
- **Synchronization**: Real-time updates via IPC

## Error Handling

### 1. Database Errors
```javascript
try {
  const result = await db.runQuery(sql, params);
  return result;
} catch (error) {
  logError('Database operation failed:', error);
  throw new Error('User-friendly error message');
}
```

### 2. Validation Errors
```javascript
try {
  const validatedData = await schema.validateAsync(data);
} catch (error) {
  if (error.isJoi) {
    throw new Error(`Validation failed: ${error.details.map(d => d.message).join('; ')}`);
  }
  throw error;
}
```

### 3. Frontend Error Handling
```javascript
try {
  await window.electronAPI.addStudent(studentData);
  showSuccessToast('Student added successfully');
} catch (error) {
  showErrorToast(error.message);
  console.error('Failed to add student:', error);
}
```

## Performance Considerations

### 1. Database Optimization
- **Indexes**: On frequently queried columns
- **Transactions**: For multi-step operations
- **Connection Pooling**: Single connection with proper lifecycle management

### 2. Frontend Optimization
- **Code Splitting**: Route-based splitting with React.lazy
- **Memoization**: React.memo for expensive components
- **Virtual Scrolling**: For large data lists

### 3. IPC Optimization
- **Batch Operations**: Combine multiple operations
- **Data Serialization**: Minimize data transfer
- **Async Operations**: Non-blocking UI updates

## Deployment Architecture

### 1. Development Environment
```
npm run dev → Vite Dev Server + Electron → Hot Reload
```

### 2. Production Build
```
npm run build → Vite Build → Electron Builder → Distributable
```

### 3. Auto-Updates
```
Electron Updater → GitHub Releases → Background Download → User Notification
```

## Future Considerations

### 1. Web Version Migration
- **Shared Business Logic**: Extract to common modules
- **API Layer**: Convert IPC to HTTP/WebSocket
- **Authentication**: Centralized auth service

### 2. Multi-Branch Support
- **Data Synchronization**: Branch-to-central sync
- **Conflict Resolution**: Merge strategies
- **Offline Capabilities**: Local-first with sync

### 3. Scalability Improvements
- **Database Sharding**: By branch or date ranges
- **Caching Layer**: Redis for frequently accessed data
- **Load Balancing**: For web version deployment

---

*This architecture documentation is maintained alongside the codebase. Last updated: 2025-01-15*