# Google Cloud Backup Setup Guide

This guide explains how to set up the Google Cloud Project and OAuth 2.0 credentials required for the Cloud Backup feature in the Quran Branch Manager application.

## 1. Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown and select **New Project**.
3. Name it `Quran-Branch-Manager` (or your choice) and click **Create**.

## 2. Enable Google Drive API
1. In the sidebar, go to **APIs & Services > Library**.
2. Search for **Google Drive API**.
3. Click on it and click **Enable**.

## 3. Configure OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**.
2. Select **User Type**: **External** and click **Create**.
3. **App Information**: Enter the app name and developer contact email.
4. **Scopes**: Click **Add or Remove Scopes**.
   - Add `.../auth/drive.file` (View and manage Google Drive files and folders that you have opened or created with this app).
   - Add `.../auth/userinfo.email` (See your primary Google Account email address).
   - Add `.../auth/userinfo.profile` (See your personal info).
5. **Test Users (IMPORTANT)**:
   - While the app is in "Testing" mode (the default), **you must explicitly add every email address** that will log in to the app.
   - If you see **Error 403: access_denied**, it's 99% because the email you're using isn't in this list.
   - Add your test Gmail account here and click **Save**.
6. **Publishing Status**: Once you've verified everything works, you can click "Publish App" to move it to "In Production". This will allow any user to log in (though they will see a "This app isn't verified" warning until you complete Google's verification process).

## 4. Create OAuth 2.0 Credentials
1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Select **Desktop app** as the Application type.
4. Name it `Electron Client`.
5. Click **Create**.
6. You will see your **Client ID** and **Client Secret**. **Copy these.**
7. **Important**: You do NOT need to add a Redirect URI in the Google Console if you selected "Desktop app". The application will automatically use a local loopback (localhost).

## 5. Configure the Application
1. In the project root, create or edit the `.env` file.
2. Add your credentials:
   ```env
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   GOOGLE_REDIRECT_URI=http://localhost:3001
   ```
3. Restart the application.

## 6. Verification
1. Go to **Settings > Backup**.
2. Click **Connect Google Account**.
3. Your browser should open the Google login page.
4. After logging in, you should see "Connected" in the application.
5. Try running a manual backup and verify it appears in both local history and the Cloud Backup table.

---

## 7. Production Deployment & Security

### How credentials work in the distributed app
When you build the app for production (e.g., `.exe` for Windows):
1. **The `.env` file is NOT bundled**: Files starting with `.` are typically ignored by `electron-builder` and `vite`.
2. **The Solution**: You should provide these keys during the build process so they are "baked into" the code.
   - For **Vite (Renderer)**: Prefix them with `VITE_` and they will be available via `import.meta.env`.
   - For **Electron (Main)**: Use Vite's `define` config to inject them.

### Recommended Production Setup
Update your `vite.config.js` (or similar build config) to inject the credentials:

```javascript
// Example in vite.config.js
export default defineConfig({
  define: {
    'process.env.GOOGLE_CLIENT_ID': JSON.stringify(process.env.GOOGLE_CLIENT_ID),
    'process.env.GOOGLE_CLIENT_SECRET': JSON.stringify(process.env.GOOGLE_CLIENT_SECRET),
  }
})
```

Alternatively, you can modify `src/main/cloudBackupManager.js` to include the values directly if you don't mind them being in the source code (Standard for desktop apps):

```javascript
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID_BEYOND_DEV';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET_BEYOND_DEV';
```

### Is it safe to expose Client ID/Secret?
**Yes, for Desktop Apps.** Google's documentation acknowledges that secrets cannot be kept secret in native/desktop binaries. This is why:
- We use the **Desktop App** client type.
- We implement **PKCE** (already done in this PR), which ensures that even if someone steals the Client Secret, they cannot intercept the login flow.
- The app only has `drive.file` scope, limiting potential damage to only files created by the app itself.

---
**Note on Security**:
- The application uses **PKCE** (Proof Key for Code Exchange) for secure authorization.
- Tokens are stored using **Electron's safeStorage API**, which encrypts data using the OS-level keychain (e.g., DPAPI on Windows, Keychain on macOS, Secret Service on Linux).
- Drive permissions are set to `drive.file` scope, meaning the app can only access files it creates.
