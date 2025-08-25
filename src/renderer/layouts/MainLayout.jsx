import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import '@/styles/Layout.css';

function MainLayout() {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="content-area">
        <Outlet />
      </main>
    </div>
  );
}

export default MainLayout;
