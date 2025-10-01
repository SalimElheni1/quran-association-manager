import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@renderer/contexts/AuthContext';
import { error as logError } from '@renderer/utils/logger';
import HomeIcon from './icons/HomeIcon';
import UsersIcon from './icons/UsersIcon';
import TeacherIcon from './icons/TeacherIcon';
import ClassesIcon from './icons/ClassesIcon';
import AttendanceIcon from './icons/AttendanceIcon';
import FinancialsIcon from './icons/FinancialsIcon';
import ExportsIcon from './icons/ExportsIcon';
import UserShieldIcon from './icons/UserShieldIcon';
import SettingsIcon from './icons/SettingsIcon';
import ProfileIcon from './icons/ProfileIcon';
import InfoIcon from './icons/InfoIcon';
import LogOutIcon from './icons/LogOutIcon';

function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [associationName, setAssociationName] = useState('الرابطة الوطنية للقرآن الكريم');

  useEffect(() => {
    const fetchAssociationName = async () => {
      try {
        const response = await window.electronAPI.getSettings();
        if (response.success && response.settings) {
          const { national_association_name, regional_association_name, local_branch_name } =
            response.settings;
          const parts = [
            national_association_name,
            regional_association_name,
            local_branch_name,
          ].filter(Boolean); // Filter out empty or null values
          if (parts.length === 3) {
            setAssociationName([parts[0], parts[2]].join('  '));
          } else if (parts.length === 2) {
            setAssociationName(parts.join('  '));
          }
        }
      } catch (err) {
        logError('Failed to fetch settings for sidebar:', err);
      }
    };
    fetchAssociationName();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-header">
          <h6>{associationName}</h6>
        </div>
        <nav className="nav-links">
          <NavLink to="/" className="nav-link">
            <HomeIcon />
            <span>الرئيسية</span>
          </NavLink>
          <NavLink to="/students" className="nav-link">
            <UsersIcon />
            <span>شؤون الطلاب</span>
          </NavLink>
          <NavLink to="/teachers" className="nav-link">
            <TeacherIcon />
            <span>شؤون المعلمين</span>
          </NavLink>
          <NavLink to="/classes" className="nav-link">
            <ClassesIcon />
            <span>الفصول الدراسية</span>
          </NavLink>
          <NavLink to="/attendance" className="nav-link">
            <AttendanceIcon />
            <span>الحضور والغياب</span>
          </NavLink>
          {user?.roles?.some((role) =>
            ['Superadmin', 'Administrator', 'FinanceManager'].includes(role),
          ) && (
            <NavLink to="/financials" className="nav-link">
              <FinancialsIcon />
              <span>الشؤون المالية</span>
            </NavLink>
          )}
          <NavLink to="/exports" className="nav-link">
            <ExportsIcon />
            <span>تصدير البيانات</span>
          </NavLink>
          {user?.roles?.includes('Superadmin') && (
            <NavLink to="/users" className="nav-link">
              <UserShieldIcon />
              <span>إدارة المستخدمين</span>
            </NavLink>
          )}
          {user?.roles?.includes('Superadmin') && (
            <NavLink to="/settings" className="nav-link">
              <SettingsIcon />
              <span>الإعدادات</span>
            </NavLink>
          )}
          <NavLink to="/profile" className="nav-link">
            <ProfileIcon />
            <span>ملفي الشخصي</span>
          </NavLink>
          <NavLink to="/about" className="nav-link">
            <InfoIcon />
            <span>حول التطبيق</span>
          </NavLink>
        </nav>
      </div>
      <button onClick={handleLogout} className="logout-btn">
        <LogOutIcon />
        <span>خروج</span>
      </button>
    </aside>
  );
}

export default Sidebar;
