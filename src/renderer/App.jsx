import React from "react";
import { Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import ProtectedRoute from "./components/ProtectedRoute";

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
        {/* We will add routes for students, teachers, etc. here */}
      </Route>
    </Routes>
  );
}

export default App;
