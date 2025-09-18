import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '@renderer/components/Sidebar';
import '@renderer/styles/Layout.css';
import OnboardingGuide from '@renderer/components/OnboardingGuide';

function MainLayout() {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="content-area">
        <Outlet />
        <OnboardingGuide />
      </main>
    </div>
  );
}

export default MainLayout;
