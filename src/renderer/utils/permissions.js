// Role-based permissions system
export const PERMISSIONS = {
  // Student Management
  STUDENTS_VIEW: 'students:view',
  STUDENTS_CREATE: 'students:create',
  STUDENTS_EDIT: 'students:edit',
  STUDENTS_DELETE: 'students:delete',
  
  // Teacher Management
  TEACHERS_VIEW: 'teachers:view',
  TEACHERS_CREATE: 'teachers:create',
  TEACHERS_EDIT: 'teachers:edit',
  TEACHERS_DELETE: 'teachers:delete',
  
  // Class Management
  CLASSES_VIEW: 'classes:view',
  CLASSES_CREATE: 'classes:create',
  CLASSES_EDIT: 'classes:edit',
  CLASSES_DELETE: 'classes:delete',
  
  // Attendance
  ATTENDANCE_VIEW: 'attendance:view',
  ATTENDANCE_MANAGE: 'attendance:manage',
  
  // Financial
  FINANCIALS_VIEW: 'financials:view',
  FINANCIALS_MANAGE: 'financials:manage',
  FINANCIALS_REPORTS: 'financials:reports',
  
  // Users
  USERS_VIEW: 'users:view',
  USERS_CREATE: 'users:create',
  USERS_EDIT: 'users:edit',
  USERS_DELETE: 'users:delete',
  
  // Settings
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_EDIT: 'settings:edit',
};

export const ROLE_PERMISSIONS = {
  Superadmin: [
    // Full access to everything
    ...Object.values(PERMISSIONS)
  ],
  
  Administrator: [
    // Student management
    PERMISSIONS.STUDENTS_VIEW,
    PERMISSIONS.STUDENTS_CREATE,
    PERMISSIONS.STUDENTS_EDIT,
    PERMISSIONS.STUDENTS_DELETE,
    
    // Teacher management
    PERMISSIONS.TEACHERS_VIEW,
    PERMISSIONS.TEACHERS_CREATE,
    PERMISSIONS.TEACHERS_EDIT,
    PERMISSIONS.TEACHERS_DELETE,
    
    // Class management
    PERMISSIONS.CLASSES_VIEW,
    PERMISSIONS.CLASSES_CREATE,
    PERMISSIONS.CLASSES_EDIT,
    PERMISSIONS.CLASSES_DELETE,
    
    // Attendance
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ATTENDANCE_MANAGE,
    
    // Limited user access
    PERMISSIONS.USERS_VIEW,
  ],
  
  FinanceManager: [
    // Financial module only
    PERMISSIONS.FINANCIALS_VIEW,
    PERMISSIONS.FINANCIALS_MANAGE,
    PERMISSIONS.FINANCIALS_REPORTS,
    
    // View students for payment purposes only
    PERMISSIONS.STUDENTS_VIEW,
  ],
  
  SessionSupervisor: [
    // Attendance only
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ATTENDANCE_MANAGE,
    
    // View students and classes for attendance purposes
    PERMISSIONS.STUDENTS_VIEW,
    PERMISSIONS.CLASSES_VIEW,
  ],
};

export const hasPermission = (userRoles, permission) => {
  if (!userRoles || !Array.isArray(userRoles)) return false;
  
  return userRoles.some(role => 
    ROLE_PERMISSIONS[role]?.includes(permission)
  );
};

export const hasAnyPermission = (userRoles, permissions) => {
  return permissions.some(permission => hasPermission(userRoles, permission));
};

export const canAccessModule = (userRoles, module) => {
  const modulePermissions = {
    students: [PERMISSIONS.STUDENTS_VIEW],
    teachers: [PERMISSIONS.TEACHERS_VIEW],
    classes: [PERMISSIONS.CLASSES_VIEW],
    attendance: [PERMISSIONS.ATTENDANCE_VIEW],
    financials: [PERMISSIONS.FINANCIALS_VIEW],
    users: [PERMISSIONS.USERS_VIEW],
    settings: [PERMISSIONS.SETTINGS_VIEW],
  };
  
  return hasAnyPermission(userRoles, modulePermissions[module] || []);
};