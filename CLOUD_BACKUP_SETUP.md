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
2. Select **External** and click **Create**.
3. **App Information**: Enter the app name and developer contact email.
4. **Scopes**: Click **Add or Remove Scopes**.
   - Add `.../auth/drive.file` (View and manage Google Drive files and folders that you have opened or created with this app).
   - Add `.../auth/userinfo.email` (See your primary Google Account email address).
5. **Test Users**: Add the email addresses of the accounts you will use for testing.
6. Complete the wizard.

## 4. Create OAuth 2.0 Credentials
1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Select **Desktop app** as the Application type.
4. Name it `Electron Client`.
5. Click **Create**.
6. You will see your **Client ID** and **Client Secret**. **Copy these.**

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
**Note on Security**:
- The application uses **PKCE** (Proof Key for Code Exchange) for secure authorization.
- Tokens are stored using **Electron's safeStorage API**, which encrypts data using the OS-level keychain (e.g., DPAPI on Windows, Keychain on macOS, Secret Service on Linux).
- Drive permissions are set to `drive.file` scope, meaning the app can only access files it creates.
