import React, { createContext, useState, useContext, useEffect } from 'react';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [logo, setLogo] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const response = await window.electronAPI.getSettings();
      if (response.success) {
        setSettings(response.settings);
        determineLogo(response.settings);
      }
      setLoading(false);
    };

    fetchSettings();
  }, []);

  const determineLogo = (settings) => {
    let logoPath = 'assets/logos/g247.png'; // Default logo

    if (settings.regional_local_logo_path) {
      logoPath = `safe-image://${settings.regional_local_logo_path}`;
    } else if (settings.national_logo_path) {
      logoPath = `safe-image://${settings.national_logo_path}`;
    }

    setLogo(logoPath);
  };

  const value = { settings, logo, loading };

  return <SettingsContext.Provider value={value}>{!loading && children}</SettingsContext.Provider>;
}

export const useSettings = () => {
  return useContext(SettingsContext);
};
