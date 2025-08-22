import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import defaultLogo from '../assets/logos/g247.png';

function Sidebar() {
  const { user, logout } = useAuth();
  const { settings, logo, nationalLogo } = useSettings();

  console.log('Sidebar settings:', settings);
  console.log('Sidebar logo:', logo);
  console.log('Sidebar nationalLogo:', nationalLogo);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-header">
          <div className="logo-container">
            <img
              src={logo && logo.startsWith('safe-image://') ? logo : defaultLogo}
              alt="Branch Logo"
              className="sidebar-logo"
            />
            {nationalLogo && logo !== nationalLogo && (
              <img
                src={nationalLogo}
                alt="National Logo"
                className="sidebar-logo-national"
              />
            )}
          </div>
          <div className="association-names">
            <h4>{settings.national_association_name || 'Quran Branch Manager'}</h4>
            {settings.regional_association_name && <h5>{settings.regional_association_name}</h5>}
            {settings.local_branch_name && <h6>{settings.local_branch_name}</h6>}
          </div>
        </div>
        <nav className="nav-links">
          <NavLink to="/" className="nav-link">
            <i className="fas fa-home"></i>
            <span>الرئيسية</span>
          </NavLink>
          <NavLink to="/students" className="nav-link">
            <i className="fas fa-users"></i>
            <span>شؤون الطلاب</span>
          </NavLink>
          <NavLink to="/teachers" className="nav-link">
            <i className="fas fa-chalkboard-teacher"></i>
            <span>شؤون المعلمين</span>
          </NavLink>
          <NavLink to="/classes" className="nav-link">
            <i className="fas fa-school"></i>
            <span>الفصول</span>
          </NavLink>
          <NavLink to="/attendance" className="nav-link">
            <i className="fas fa-calendar-check"></i>
            <span>الحضور والغياب</span>
          </NavLink>
          {['Superadmin', 'Admin', 'FinanceManager', 'Manager'].includes(user?.role) && (
            <NavLink to="/financials" className="nav-link">
              <i className="fas fa-wallet"></i>
              <span>الشؤون المالية</span>
            </NavLink>
          )}
          <NavLink to="/profile" className="nav-link">
            <i className="fas fa-user-cog"></i>
            <span>ملفي الشخصي</span>
          </NavLink>
          <NavLink to="/exports" className="nav-link">
            <i className="fas fa-file-export"></i>
            <span>التصدير</span>
          </NavLink>
          {user?.role === 'Superadmin' && (
            <NavLink to="/users" className="nav-link">
              <i className="fas fa-user-shield"></i>
              <span>المستخدمون</span>
            </NavLink>
          )}
          {user?.role === 'Superadmin' && (
            <NavLink to="/settings" className="nav-link">
              <i className="fas fa-cog"></i>
              <span>إعدادات النظام</span>
            </NavLink>
          )}
        </nav>
      </div>
      <button onClick={handleLogout} className="logout-btn">
        <i className="fas fa-sign-out-alt"></i>
        <span>خروج</span>
      </button>
    </aside>
  );
}

export default Sidebar;
