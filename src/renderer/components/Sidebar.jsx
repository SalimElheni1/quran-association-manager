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
          <h3>📖 مدير الفروع</h3>
        </div>
        <nav className="nav-links">
          <NavLink to="/" className="nav-link">
            <i className="fas fa-home"></i>
            <span>لوحة التحكم</span>
          </NavLink>
          <NavLink to="/students" className="nav-link">
            <i className="fas fa-users"></i>
            <span>الطلاب</span>
          </NavLink>
          <NavLink to="/teachers" className="nav-link">
            <i className="fas fa-chalkboard-teacher"></i>
            <span>المعلمين</span>
          </NavLink>
          <NavLink to="/classes" className="nav-link">
            <i className="fas fa-school"></i>
            <span>الفصول الدراسية</span>
          </NavLink>
          <NavLink to="/attendance" className="nav-link">
            <i className="fas fa-calendar-check"></i>
            <span>تسجيل الحضور</span>
          </NavLink>
          {['Superadmin', 'FinanceManager'].includes(user?.role) && (
            <NavLink to="/financials" className="nav-link">
              <i className="fas fa-coins"></i>
              <span>المالية</span>
            </NavLink>
          )}
          {user?.role === 'Superadmin' && (
            <NavLink to="/users" className="nav-link">
              <i className="fas fa-user-shield"></i>
              <span>إدارة المستخدمين</span>
            </NavLink>
          )}
        </nav>
      </div>
      <button onClick={handleLogout} className="logout-btn">
        <i className="fas fa-sign-out-alt"></i>
        <span>تسجيل الخروج</span>
      </button>
    </aside>
  );
}

export default Sidebar;
