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
        if (response.success) {
          setSettings(response.settings);
          determineLogos(response.settings);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
      setLoading(false);
    };

    fetchSettings();
  }, []);

  const determineLogos = (settings) => {
    // The settings object now comes with pre-formatted URLs
    let primaryLogo = null;
    if (settings && settings.regional_local_logo_path) {
      primaryLogo = settings.regional_local_logo_path;
    } else if (settings && settings.national_logo_path) {
      primaryLogo = settings.national_logo_path;
    }
    setLogo(primaryLogo);

    if (settings && settings.national_logo_path) {
      setNationalLogo(settings.national_logo_path);
    }
  };

  const value = { settings, logo, nationalLogo, loading };

  return <SettingsContext.Provider value={value}>{!loading && children}</SettingsContext.Provider>;
}

export const useSettings = () => {
  return useContext(SettingsContext);
};
