import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-header">
          <h3>📖 مدير الفروع القرآنية</h3>
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
