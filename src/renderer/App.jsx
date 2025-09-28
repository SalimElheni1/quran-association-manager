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
   * Effect hook to listen for initial credentials from the main process.
   * This is triggered when a new database is created and a superadmin user is seeded.
   */
  useEffect(() => {
    // Listen for the event from the main process
    const removeListener = window.electronAPI.onShowInitialCredentials((event, credentials) => {
      setInitialCredentials(credentials);
    });

    // Cleanup the listener when the component unmounts
    return () => {
      removeListener();
    };
  }, []);

  /**
   * Handles closing the initial credentials banner.
   * Called when the user acknowledges the credentials display.
   */
  const handleCloseInitialCredentialsBanner = () => {
    setInitialCredentials(null);
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
          <Route path="/students" element={<Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}><StudentsPage /></Suspense>} />
          <Route path="/teachers" element={<Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}><TeachersPage /></Suspense>} />
          <Route path="/classes" element={<Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}><ClassesPage /></Suspense>} />
          <Route path="/attendance" element={<Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}><AttendancePage /></Suspense>} />
          <Route path="/financials" element={<Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}><FinancialsPage /></Suspense>} />
          <Route path="/users" element={<Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}><UsersPage /></Suspense>} />
          <Route path="/profile" element={<Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}><ProfilePage /></Suspense>} />
          <Route path="/settings" element={<Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}><SettingsPage /></Suspense>} />
          <Route path="/exports" element={<Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}><ExportsPage /></Suspense>} />
          <Route path="/about" element={<Suspense fallback={<div className="text-center p-4">جاري التحميل...</div>}><AboutPage /></Suspense>} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
