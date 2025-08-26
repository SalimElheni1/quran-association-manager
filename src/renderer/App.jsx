import React from 'react';
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
import ProtectedRoute from '@renderer/components/ProtectedRoute';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
      </Route>
    </Routes>
  );
}

export default App;
