import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@renderer/contexts/AuthContext';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { error as logError } from '@renderer/utils/logger';
import HomeIcon from './icons/HomeIcon';
import UsersIcon from './icons/UsersIcon';
import TeacherIcon from './icons/TeacherIcon';
import ClassesIcon from './icons/ClassesIcon';
import AttendanceIcon from './icons/AttendanceIcon';
import FinancialsIcon from './icons/FinancialsIcon';

import UserShieldIcon from './icons/UserShieldIcon';
import SettingsIcon from './icons/SettingsIcon';
import ProfileIcon from './icons/ProfileIcon';
import InfoIcon from './icons/InfoIcon';
import LogOutIcon from './icons/LogOutIcon';

function Sidebar({ collapsed = false }) {
  const { user, logout } = useAuth();
  const { canAccessModule } = usePermissions();
  const navigate = useNavigate();
  const [nationalName, setNationalName] = useState('الرابطة الوطنية للقرآن الكريم');
  const [regionalName, setRegionalName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [logoPath, setLogoPath] = useState(null);

  useEffect(() => {
    const fetchAssociationName = async () => {
      try {
        const response = await window.electronAPI.getSettings();
        if (response.success && response.settings) {
          const { national_association_name, regional_association_name, local_branch_name } =
            response.settings;
          const national = national_association_name?.trim() || '';
          const regional = regional_association_name?.trim() || '';
          const branch = local_branch_name?.trim() || '';
          if (national) setNationalName(national);
          if (regional) setRegionalName(regional);
          if (branch) setBranchName(branch);
        }
      } catch (err) {
        logError('Failed to fetch settings for sidebar:', err);
      }
    };

    const fetchLogo = async () => {
      try {
        // Prefer the local branch logo, else the national logo, else nothing.
        const response = await window.electronAPI.getLogo();
        if (response.success && response.path) {
          setLogoPath(response.path);
        }
      } catch (err) {
        logError('Failed to fetch logo for sidebar:', err);
      }
    };

    fetchAssociationName();
    fetchLogo();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const displayName =
    user && (user.first_name || user.last_name)
      ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
      : user?.username || '';

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div>
        <div className="sidebar-header">
          <div className="brand-mark">
            {logoPath ? (
              <img src={logoPath} alt="شعار" className="brand-logo" aria-hidden="true" />
            ) : (
              <span className="brand-glyph" aria-hidden="true">
                ق
              </span>
            )}
            <div className="brand-titles">
              {branchName && <span className="branch-name">{branchName}</span>}
              <span className="national-name">{nationalName}</span>
              {regionalName && <span className="regional-name">{regionalName}</span>}
            </div>
          </div>
        </div>
        <nav className="nav-links">
          <NavLink to="/" className="nav-link">
            <HomeIcon />
            <span>الرئيسية</span>
          </NavLink>
          {canAccessModule('students') && (
            <NavLink to="/students" className="nav-link">
              <UsersIcon />
              <span>شؤون الطلاب</span>
            </NavLink>
          )}
          {canAccessModule('teachers') && (
            <NavLink to="/teachers" className="nav-link">
              <TeacherIcon />
              <span>شؤون المعلمين</span>
            </NavLink>
          )}
          {canAccessModule('classes') && (
            <NavLink to="/classes" className="nav-link">
              <ClassesIcon />
              <span>الفصول الدراسية</span>
            </NavLink>
          )}
          {canAccessModule('attendance') && (
            <NavLink to="/attendance" className="nav-link">
              <AttendanceIcon />
              <span>الحضور والغياب</span>
            </NavLink>
          )}
          {canAccessModule('financials') && (
            <NavLink to="/financials" className="nav-link">
              <FinancialsIcon />
              <span>الشؤون المالية</span>
            </NavLink>
          )}

          {canAccessModule('users') && (
            <NavLink to="/users" className="nav-link">
              <UserShieldIcon />
              <span>إدارة المستخدمين</span>
            </NavLink>
          )}
          {canAccessModule('settings') && (
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
      <div className="sidebar-footer">
        {user && (
          <div className="sidebar-user">
            <span className="user-avatar" aria-hidden="true">
              {(displayName || '؟').charAt(0)}
            </span>
            <span className="user-meta">
              <span className="user-name">{displayName}</span>
            </span>
          </div>
        )}
        <button onClick={handleLogout} className="logout-btn">
          <LogOutIcon />
          <span>خروج</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
