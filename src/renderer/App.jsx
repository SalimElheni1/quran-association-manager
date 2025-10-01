/**
 * @fileoverview Main React application component for Quran Branch Manager.
 * Handles routing, initial credentials display, and application-wide state management.
 * 
 * This component serves as the root of the React application and manages:
 * - Application routing using React Router
 * - Initial superadmin credentials display
 * - Protected route authentication
 * - Layout structure
 * 
 * @author Quran Branch Manager Team
 * @version 1.0.2-beta
 * @requires react - React library
 * @requires react-router-dom - Client-side routing
 */

import React, { useState, useEffect, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import MainLayout from '@renderer/layouts/MainLayout';
import DashboardPage from '@renderer/pages/DashboardPage';
import LoginPage from '@renderer/pages/LoginPage';
import ProtectedRoute from '@renderer/components/ProtectedRoute';
import { PERMISSIONS } from '@renderer/utils/permissions';

// Lazy load heavy pages
const StudentsPage = React.lazy(() => import('@renderer/pages/StudentsPage'));
const TeachersPage = React.lazy(() => import('@renderer/pages/TeachersPage'));
const ClassesPage = React.lazy(() => import('@renderer/pages/ClassesPage'));
const UsersPage = React.lazy(() => import('@renderer/pages/UsersPage'));
const AttendancePage = React.lazy(() => import('@renderer/pages/AttendancePage'));
const ProfilePage = React.lazy(() => import('@renderer/pages/ProfilePage'));
const SettingsPage = React.lazy(() => import('@renderer/pages/SettingsPage'));
const FinancialsPage = React.lazy(() => import('@renderer/pages/FinancialsPage'));
const ExportsPage = React.lazy(() => import('@renderer/pages/ExportsPage'));
const AboutPage = React.lazy(() => import('@renderer/pages/AboutPage'));

/**
 * Main application component that handles routing and global state.
 * 
 * Features:
 * - Client-side routing with React Router
 * - Protected routes requiring authentication
 * - Initial credentials banner for new installations
 * - Nested layout structure with MainLayout
 * 
 * @component
 * @returns {JSX.Element} The main application component
 */
function App() {
  /**
   * State to store initial superadmin credentials when a new database is created.
   * These credentials are displayed to the user on first login.
   * @type {Object|null}
   */
  const [initialCredentials, setInitialCredentials] = useState(null);

  /**
   * Effect hook to fetch initial credentials from the main process.
   * This is triggered on first launch to display superadmin credentials.
   */
  useEffect(() => {
    const fetchCredentials = async () => {
      const credentials = await window.electronAPI.getInitialCredentials();
      if (credentials) {
        setInitialCredentials(credentials);
      }
    };

    fetchCredentials();
  }, []);

  /**
   * Handles closing the initial credentials banner.
   * Called when the user acknowledges the credentials display.
   */
  const handleCloseInitialCredentialsBanner = () => {
    setInitialCredentials(null);
    window.electronAPI.clearInitialCredentials();
  };

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            <LoginPage
              initialCredentials={initialCredentials}
              onCloseBanner={handleCloseInitialCredentialsBanner}
            />
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          {/* Child routes will be rendered inside MainLayout's <Outlet> */}
          <Route index element={<DashboardPage />} />
          <Route path="/students" element={
            <ProtectedRoute requiredModule="students">
              <Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}>
                <StudentsPage />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/teachers" element={
            <ProtectedRoute requiredModule="teachers">
              <Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}>
                <TeachersPage />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/classes" element={
            <ProtectedRoute requiredModule="classes">
              <Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}>
                <ClassesPage />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/attendance" element={
            <ProtectedRoute requiredModule="attendance">
              <Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}>
                <AttendancePage />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/financials" element={
            <ProtectedRoute requiredModule="financials">
              <Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}>
                <FinancialsPage />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute requiredModule="users">
              <Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}>
                <UsersPage />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/profile" element={<Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}><ProfilePage /></Suspense>} />
          <Route path="/settings" element={
            <ProtectedRoute requiredModule="settings">
              <Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}>
                <SettingsPage />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/exports" element={<Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}><ExportsPage /></Suspense>} />
          <Route path="/about" element={<Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}><AboutPage /></Suspense>} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
