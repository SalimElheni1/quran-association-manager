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

import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import MainLayout from '@renderer/layouts/MainLayout';
import DashboardPage from '@renderer/pages/DashboardPage';
import LoginPage from '@renderer/pages/LoginPage';
import StudentsPage from '@renderer/pages/StudentsPage';
import TeachersPage from '@renderer/pages/TeachersPage';
import ClassesPage from '@renderer/pages/ClassesPage';
import UsersPage from '@renderer/pages/UsersPage';
import AttendancePage from '@renderer/pages/AttendancePage';
import ProfilePage from '@renderer/pages/ProfilePage';
import SettingsPage from '@renderer/pages/SettingsPage';
import FinancialsPage from '@renderer/pages/FinancialsPage';
import ExportsPage from '@renderer/pages/ExportsPage';
import AboutPage from '@renderer/pages/AboutPage';
import ProtectedRoute from '@renderer/components/ProtectedRoute';

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
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/teachers" element={<TeachersPage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/financials" element={<FinancialsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/exports" element={<ExportsPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
