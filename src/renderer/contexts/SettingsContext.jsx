import React, { createContext, useState, useContext, useEffect } from 'react';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [logo, setLogo] = useState(null);
  const [nationalLogo, setNationalLogo] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await window.electronAPI.getSettings();
        console.log('Settings response:', response);
        if (response.success) {
          setSettings(response.settings);
          determineLogos(response.settings);
        } else {
          console.error('Failed to fetch settings:', response.message);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
      setLoading(false);
    };

    fetchSettings();
  }, []);

  const determineLogos = (settings) => {
    let primaryLogoPath = 'assets/logos/g247.png'; // Default logo
    if (settings.regional_local_logo_path) {
      primaryLogoPath = `safe-image://${settings.regional_local_logo_path}`;
    } else if (settings.national_logo_path) {
      primaryLogoPath = `safe-image://${settings.national_logo_path}`;
    }
    setLogo(primaryLogoPath);

    if (settings.national_logo_path) {
      setNationalLogo(`safe-image://${settings.national_logo_path}`);
    }
  };

  const value = { settings, logo, nationalLogo, loading };

  return <SettingsContext.Provider value={value}>{!loading && children}</SettingsContext.Provider>;
}

export const useSettings = () => {
  return useContext(SettingsContext);
};
