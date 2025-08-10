import React, { useState, useEffect } from 'react';

function App() {
  const [version, setVersion] = useState('...');

  useEffect(() => {
    // Example of using the preload script to call the main process
    window.electronAPI.getAppVersion().then(setVersion);
  }, []);

  return (
    <div className="container mt-5 text-center">
      <h1>📖 Quran Branch Manager</h1>
      <p>Welcome! Your React app is running inside Electron v{version}.</p>
    </div>
  );
}

export default App;
