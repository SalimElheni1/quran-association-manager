const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { createReadStream, createWriteStream } = require('fs');
const { app, shell, BrowserWindow, safeStorage } = require('electron');
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const Store = require('electron-store');
const { log, error: logError } = require('./logger');
const crypto = require('crypto');

const store = new Store();

// Connectivity tracking
let isOnline = true;

/**
 * Securely stores tokens using Electron's safeStorage.
 */
const saveTokensSecurely = (tokens) => {
  try {
    const tokensStr = JSON.stringify(tokens);
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(tokensStr);
      store.set('google_tokens_encrypted', encrypted.toString('base64'));
      store.delete('google_tokens'); // Clean up old plain text tokens
    } else {
      log('Warning: safeStorage encryption not available. Falling back to plain text.');
      store.set('google_tokens', tokens);
    }
  } catch (err) {
    logError('Failed to save tokens securely:', err);
  }
};

/**
 * Retrieves securely stored tokens.
 */
const getTokensSecurely = () => {
  try {
    const encryptedBase64 = store.get('google_tokens_encrypted');
    if (encryptedBase64 && safeStorage.isEncryptionAvailable()) {
      const encrypted = Buffer.from(encryptedBase64, 'base64');
      const decrypted = safeStorage.decryptString(encrypted);
      return JSON.parse(decrypted);
    }
    return store.get('google_tokens'); // Fallback to plain text if no encrypted ones
  } catch (err) {
    logError('Failed to retrieve tokens securely:', err);
    return null;
  }
};

/**
 * cloudBackupManager.js (Google Drive Implementation)
 *
 * Handles connecting to Google Drive, managing backups, and history.
 */

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.metadata.readonly' // Added for better metadata access
];

// Google API Credentials
// Loaded from secure config (environment in dev, embedded in prod)
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = require('./config/credentials');

const CLIENT_ID = GOOGLE_CLIENT_ID;
const CLIENT_SECRET = GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = GOOGLE_REDIRECT_URI;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Load existing tokens if any
const tokens = getTokensSecurely();
if (tokens) {
  oauth2Client.setCredentials(tokens);
}

// Listen for token refresh
oauth2Client.on('tokens', (newTokens) => {
  const currentTokens = getTokensSecurely() || {};
  saveTokensSecurely({ ...currentTokens, ...newTokens });
  log('Google Drive: Tokens refreshed and saved securely.');
});

/**
 * Generates a code verifier and challenge for PKCE.
 */
const generatePKCE = () => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
};

/**
 * Starts the OAuth2 flow to connect a Google account.
 * Opens the system browser for login and starts a local server to listen for the redirect.
 * @returns {Promise<{success: boolean, email: string}>}
 */
const connectGoogle = async () => {
  return new Promise((resolve, reject) => {
    const { verifier, challenge } = generatePKCE();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });

    log('Google Drive: Opening auth URL with PKCE...');
    shell.openExternal(authUrl);

    const server = http.createServer(async (req, res) => {
      try {
        if (req.url.startsWith('/?code=')) {
          const queryObject = url.parse(req.url, true).query;
          const code = queryObject.code;

          res.end('Authentication successful! You can close this window and return to the app.');
          server.close();

          const { tokens } = await oauth2Client.getToken({
            code,
            codeVerifier: verifier
          });
          oauth2Client.setCredentials(tokens);
          saveTokensSecurely(tokens);

          // Get user email
          const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
          const userInfo = await oauth2.userinfo.get();
          const email = userInfo.data.email;

          log(`Google Drive: Connected to ${email}`);
          resolve({ success: true, email });
        }
      } catch (error) {
        logError('Google Drive: Auth failed:', error);
        res.end('Authentication failed. Please check the logs.');
        server.close();
        reject(error);
      }
    }).listen(3001, () => {
      log('Google Drive: Local server listening for OAuth redirect on port 3001...');
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out.'));
    }, 5 * 60 * 1000);
  });
};

/**
 * Disconnects the Google account.
 */
const disconnectGoogle = async () => {
  store.delete('google_tokens');
  store.delete('google_tokens_encrypted');
  store.delete('cloud_backups');
  oauth2Client.setCredentials(null);

  // Persist disconnect state to the database
  try {
    const { internalUpdateSettingsHandler, internalGetSettingsHandler } = require('./handlers/settingsHandlers');
    const { settings: currentSettings } = await internalGetSettingsHandler();
    await internalUpdateSettingsHandler({
      ...currentSettings,
      google_connected: false,
      google_account_email: '',
      cloud_backup_enabled: false,
    });
    log('Google Drive: Disconnected and settings persisted to database.');
  } catch (err) {
    logError('Google Drive: Disconnected tokens but failed to persist settings:', err);
  }

  return { success: true, message: 'تم إلغاء الربط بحساب Google.' };
};

/**
 * Compresses a file using Gzip.
 * @param {string} sourcePath
 * @param {string} destPath
 */
const compressFile = async (sourcePath, destPath) => {
  const gzip = zlib.createGzip();
  const source = createReadStream(sourcePath);
  const destination = createWriteStream(destPath);
  await pipeline(source, gzip, destination);
};

/**
 * Decompresses a file using Gzip.
 * @param {string} sourcePath
 * @param {string} destPath
 */
const decompressFile = async (sourcePath, destPath) => {
  const gunzip = zlib.createGunzip();
  const source = createReadStream(sourcePath);
  const destination = createWriteStream(destPath);
  await pipeline(source, gunzip, destination);
};

/**
 * Checks if an error is network/connectivity related.
 */
const isNetworkError = (error) => {
  if (!error) return false;
  return error.code === 'ENOTFOUND' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'EAI_AGAIN' || // DNS failed
    (error.message && (
      error.message.toLowerCase().includes('network') ||
      error.message.toLowerCase().includes('fetch') ||
      error.message.toLowerCase().includes('getaddrinfo') ||
      error.message.toLowerCase().includes('dns')
    ));
};

const ARABIC_OFFLINE_MESSAGE = 'فشل الاتصال بخدمات Google. يرجى التحقق من اتصالك بالإنترنت.';
const ARABIC_OFFLINE_QUEUED_MESSAGE = 'فشل الاتصال بخدمات Google. يرجى التحقق من اتصالك بالإنترنت. تم وضع النسخة في قائمة الانتظار للرفع التلقائي لاحقاً.';

/**
 * Finds or creates the dedicated backup folder on Google Drive.
 * @param {Object} drive - Google Drive instance.
 * @returns {Promise<string>} Folder ID.
 */
const getOrCreateBackupFolder = async (drive) => {
  const folderName = 'AlRabita_Digital_Backups';
  try {
    // Search for the folder
    const response = await drive.files.list({
      q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id;
    }

    // Create it if not found
    log(`Google Drive: Creating dedicated folder '${folderName}'...`);
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };

    const folder = await drive.files.create({
      resource: folderMetadata,
      fields: 'id'
    });

    return folder.data.id;
  } catch (error) {
    logError('Google Drive: Failed to get or create backup folder:', error);
    if (isNetworkError(error)) {
      throw new Error(ARABIC_OFFLINE_MESSAGE);
    }
    throw error;
  }
};

/**
 * Synchronizes the cloud manifest file.
 * @param {Object} drive - Google Drive instance.
 * @param {string} folderId - ID of the dedicated folder.
 * @param {string} operation - 'add' or 'delete'.
 * @param {Object} backupData - Data to add or remove.
 */
const syncWithManifest = async (drive, folderId, operation, backupData) => {
  const manifestName = 'manifest.json';
  let manifestId = null;
  let manifestContent = { backups: [] };

  try {
    // 1. Find manifest file
    const search = await drive.files.list({
      q: `name = '${manifestName}' and '${folderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (search.data.files && search.data.files.length > 0) {
      manifestId = search.data.files[0].id;
      const res = await drive.files.get({ fileId: manifestId, alt: 'media' });
      let incoming = res.data;

      if (typeof incoming === 'string') {
        try {
          manifestContent = JSON.parse(incoming);
        } catch (e) {
          logError('Failed to parse manifest string:', e);
          manifestContent = { backups: [] };
        }
      } else if (typeof incoming === 'object' && incoming !== null) {
        manifestContent = incoming;
      }
    }

    // Ensure backups array exists
    if (!manifestContent.backups || !Array.isArray(manifestContent.backups)) {
      manifestContent.backups = [];
    }

    // 2. Update content
    if (operation === 'add') {
      manifestContent.backups = [backupData, ...manifestContent.backups].slice(0, 50);
    } else if (operation === 'delete') {
      const initialCount = manifestContent.backups.length;
      // backupData should be the id (UUID) or driveFileId
      manifestContent.backups = manifestContent.backups.filter(b => b.driveFileId !== backupData && b.id !== backupData);
      log(`Manifest sync [delete]: Initial count ${initialCount}, Final count ${manifestContent.backups.length}`);
    }

    // 3. Upload back
    const media = {
      mimeType: 'application/json',
      body: JSON.stringify(manifestContent, null, 2)
    };

    if (manifestId) {
      await drive.files.update({
        fileId: manifestId,
        media: media,
        fields: 'id'
      });
      log(`Google Drive: Manifest updated (ID: ${manifestId})`);
    } else {
      const created = await drive.files.create({
        resource: {
          name: manifestName,
          parents: [folderId]
        },
        media: media,
        fields: 'id'
      });
      log(`Google Drive: New manifest created (ID: ${created.data.id})`);
    }

    // Also update local store for immediate UI refresh
    store.set('cloud_backups', manifestContent.backups);
    return manifestContent.backups;
  } catch (error) {
    logError('Google Drive: Failed to sync manifest:', error);
    if (isNetworkError(error)) {
      throw new Error(ARABIC_OFFLINE_MESSAGE);
    }
    throw error;
  }
};

/**
 * Uploads a local backup file to Google Drive.
 * @param {string} filePath - Path to the local .qdb file.
 * @param {Object} settings - Application settings.
 * @param {string} createdBy - Friendly name of the user who initiated the backup.
 * @returns {Promise<{success: boolean, backup: Object}>}
 */
const uploadBackup = async (filePath, settings, createdBy = 'مستخدم التطبيق') => {
  const fileName = path.basename(filePath);
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  let userEmail = 'Unknown';
  try {
    const userInfo = await oauth2.userinfo.get();
    userEmail = userInfo.data.email;
  } catch (e) {
    // Ignore, might be offline
  }

  try {
    if (!getTokensSecurely()) {
      throw new Error('Google account not connected.');
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const compressedPath = `${filePath}.gz`;

    log(`Google Drive: Compressing ${fileName}...`);
    await compressFile(filePath, compressedPath);

    log(`Google Drive: Ensuring dedicated folder exists...`);
    const folderId = await getOrCreateBackupFolder(drive);

    log(`Google Drive: Uploading ${fileName}.gz to folder ${folderId}...`);
    const fileMetadata = {
      name: `${fileName}.gz`,
      description: 'Quran Branch Manager Database Backup',
      parents: [folderId]
    };
    const media = {
      mimeType: 'application/gzip',
      body: createReadStream(compressedPath)
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink, size'
    });

    const file = response.data;

    // Set permissions to "anyone with link" for permanent shareable link
    await drive.permissions.create({
      fileId: file.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    // Get the updated link
    const updatedFile = await drive.files.get({
      fileId: file.id,
      fields: 'webViewLink'
    });

    const backupRecord = {
      id: crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4(),
      name: fileName,
      driveFileId: file.id,
      shareableLink: updatedFile.data.webViewLink,
      createdAt: new Date().toISOString(),
      size: (require('fs').statSync(compressedPath)).size,
      createdBy: createdBy
    };

    // Update shared manifest and local history
    await syncWithManifest(drive, folderId, 'add', backupRecord);

    const finalRecord = { ...backupRecord, status: 'success' };

    // Cleanup compressed file
    if (require('fs').existsSync(compressedPath)) {
      await fs.unlink(compressedPath);
    }

    log(`Google Drive: Upload successful. ID: ${file.id}`);
    return { success: true, backup: finalRecord };
  } catch (error) {
    logError('Google Drive: Upload failed:', error);

    if (isNetworkError(error)) {
      log('Network error detected. Queueing cloud backup for later retry.');

      const backupRecord = {
        id: crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4(),
        name: fileName,
        status: 'pending',
        createdAt: new Date().toISOString(),
        size: (require('fs').statSync(filePath)).size,
        createdBy: createdBy,
        localPath: filePath
      };

      const history = store.get('cloud_backups') || [];
      store.set('cloud_backups', [backupRecord, ...history]);

      queueCloudBackup(filePath, backupRecord.id);
      return {
        success: false,
        message: ARABIC_OFFLINE_QUEUED_MESSAGE,
        queued: true
      };
    }

    return { success: false, message: `تعذر إتمام العملية: ${error.message}` };
  }
};

/**
 * Queues a backup for later upload.
 */
const queueCloudBackup = (filePath, recordId) => {
  const queue = store.get('cloud_backup_queue') || [];
  if (!queue.some(item => item.recordId === recordId)) {
    queue.push({ filePath, recordId });
    store.set('cloud_backup_queue', queue);
  }
};

/**
 * Processes the cloud backup queue.
 */
const processQueue = async () => {
  const queue = store.get('cloud_backup_queue') || [];
  if (queue.length === 0) return;

  log(`Google Drive: Processing queue (${queue.length} items)...`);
  const remaining = [];

  for (const item of queue) {
    const { filePath, recordId } = item;
    try {
      // Check if file still exists
      try {
        await fs.access(filePath);
      } catch (e) {
        log(`Queue: File ${filePath} no longer exists. Removing from queue.`);
        // Mark record as failed or remove it
        const history = store.get('cloud_backups') || [];
        store.set('cloud_backups', history.filter(b => b.id !== recordId));
        continue;
      }

      const result = await uploadBackup(filePath, { cloud_backup_enabled: true });
      if (!result.success && result.queued) {
        remaining.push(item);
      } else if (result.success) {
        log(`Queue: Successfully uploaded ${filePath}`);
        // Notify renderer
        const { mainWindow } = require('./index');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ui:show-success-toast', 'تم رفع النسخة المؤجلة للسحابة بنجاح.');
        }
      } else {
        log(`Queue: Failed to upload ${filePath}: ${result.message}`);
        remaining.push(filePath);
      }
    } catch (err) {
      logError(`Queue: Unexpected error processing ${filePath}:`, err);
      remaining.push(filePath);
    }
  }

  store.set('cloud_backup_queue', remaining);
};

// Start background queue processor
setInterval(() => {
  // Simple check for online status (can be improved)
  processQueue();
}, 15 * 60 * 1000); // Every 15 minutes

/**
 * Lists backups by fetching the shared manifest from Google Drive.
 */
const listCloudBackups = async () => {
  try {
    if (!getTokensSecurely()) {
      return { success: true, backups: store.get('cloud_backups') || [] };
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const folderId = await getOrCreateBackupFolder(drive);

    const manifestName = 'manifest.json';
    const search = await drive.files.list({
      q: `name = '${manifestName}' and '${folderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (search.data.files && search.data.files.length > 0) {
      const manifestId = search.data.files[0].id;
      const res = await drive.files.get({ fileId: manifestId, alt: 'media' });
      let content = res.data;

      if (typeof content === 'string') {
        try {
          content = JSON.parse(content);
        } catch (e) {
          content = { backups: [] };
        }
      } else if (typeof content === 'object' && content !== null) {
        // Already an object
      } else {
        content = { backups: [] };
      }

      const backups = content.backups || [];
      store.set('cloud_backups', backups);
      return { success: true, backups };
    }

    // Manifest not found on Drive: clear local cache to stay in sync
    store.set('cloud_backups', []);
    return { success: true, backups: [] };
  } catch (error) {
    logError('Google Drive: List failed (fallback to local):', error);

    if (isNetworkError(error)) {
      return { success: false, message: ARABIC_OFFLINE_MESSAGE, backups: store.get('cloud_backups') || [] };
    }

    return { success: false, message: error.message, backups: store.get('cloud_backups') || [] };
  }
};

/**
 * Downloads a backup from Google Drive and decompresses it.
 * @param {string} fileId - Drive file ID.
 * @param {string} fileName - Original file name.
 * @returns {Promise<string>} Path to the decompressed local file.
 */
const downloadBackup = async (fileId, fileName) => {
  try {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const tempDir = path.join(app.getPath('temp'), 'quran-branch-manager-gdrive');
    if (!require('fs').existsSync(tempDir)) {
      await fs.mkdir(tempDir, { recursive: true });
    }

    const compressedPath = path.join(tempDir, `${fileName}.gz`);
    const destPath = path.join(tempDir, fileName);

    log(`Google Drive: Downloading file ID ${fileId}...`);
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    const dest = createWriteStream(compressedPath);

    await pipeline(res.data, dest);

    log(`Google Drive: Decompressing...`);
    await decompressFile(compressedPath, destPath);

    // Cleanup compressed file
    await fs.unlink(compressedPath);

    return { success: true, path: destPath };
  } catch (error) {
    logError('Google Drive: Download failed:', error);
    if (isNetworkError(error)) {
      return { success: false, message: ARABIC_OFFLINE_MESSAGE };
    }
    return { success: false, message: error.message };
  }
};

/**
 * Downloads a backup from a shared Google Drive Link.
 * @param {string} link - Google Drive shareable link.
 * @returns {Promise<string>} Path to the decompressed local file.
 */
const downloadFromLink = async (link) => {
  try {
    let fileId = null;
    const patterns = [
      /request=([^&]+)/,
      /file\/d\/([^/]+)/,
      /id=([^&]+)/
    ];

    for (const pattern of patterns) {
      const match = link.match(pattern);
      if (match && match[1]) {
        fileId = match[1];
        break;
      }
    }

    if (!fileId) {
      return { success: false, message: 'تعذر استخراج معرف الملف من الرابط.' };
    }

    try {
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      const fileMeta = await drive.files.get({ fileId, fields: 'name' });
      return await downloadBackup(fileId, fileMeta.data.name.replace('.gz', ''));
    } catch (e) {
      if (getTokensSecurely()) {
        return await downloadBackup(fileId, 'imported_backup.qdb');
      } else {
        return { success: false, message: 'يرجى ربط حساب Google أولاً لاستخدام هذه الميزة.' };
      }
    }
  } catch (error) {
    logError('Google Drive: Import from link failed:', error);
    if (isNetworkError(error)) {
      return { success: false, message: ARABIC_OFFLINE_MESSAGE };
    }
    return { success: false, message: error.message };
  }
};

/**
 * Deletes a backup from Google Drive and local history.
 * @param {string} id - Local backup record ID.
 */
const deleteBackup = async (id) => {
  try {
    const history = store.get('cloud_backups') || [];
    const backup = history.find(b => b.id === id);
    if (!backup) throw new Error('Backup not found in history.');

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const folderId = await getOrCreateBackupFolder(drive);

    log(`Google Drive: Deleting file ID ${backup.driveFileId}...`);

    try {
      await drive.files.delete({ fileId: backup.driveFileId });
    } catch (e) {
      logError('Google Drive: Could not delete from Drive (it might be already gone):', e);
    }

    log(`Google Drive: File deleted ID ${backup.driveFileId}`);

    // Update shared manifest and local history
    await syncWithManifest(drive, folderId, 'delete', id);

    return { success: true, message: 'تم حذف النسخة بنجاح.' };
  } catch (error) {
    logError('Google Drive: Delete failed:', error);
    if (isNetworkError(error)) {
      return { success: false, message: ARABIC_OFFLINE_MESSAGE };
    }
    return { success: false, message: `فشل الحذف: ${error.message}` };
  }
};

let cloudSchedulerId = null;

/**
 * Checks if a cloud backup is due.
 */
const isCloudBackupDue = (settings) => {
  if (!settings.cloud_backup_enabled) return false;

  const history = store.get('cloud_backups') || [];
  const lastCloudBackup = history.find(b => b.status === 'success');
  const now = new Date();

  if (!lastCloudBackup) return true;

  const lastDate = new Date(lastCloudBackup.createdAt);
  const diffHours = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);

  // Use cloud-specific frequency if it exists, otherwise fallback to global/local one
  const frequency = settings.cloud_backup_frequency || settings.backup_frequency || 'daily';

  switch (frequency) {
    case 'daily': return diffHours >= 24;
    case 'weekly': return diffHours >= 24 * 7;
    case 'monthly': return diffHours >= 24 * 30;
    default: return false;
  }
};

/**
 * Starts the cloud-specific scheduler.
 */
const startCloudScheduler = (settings) => {
  if (cloudSchedulerId) clearInterval(cloudSchedulerId);

  if (!settings.cloud_backup_enabled) {
    log('Cloud backup scheduler disabled.');
    return;
  }

  log(`Cloud backup scheduler started. Frequency: ${settings.cloud_backup_frequency || settings.backup_frequency || 'daily'}`);

  // Process queue immediately on start
  processQueue();

  // Check every 30 minutes for overdue cloud backups
  cloudSchedulerId = setInterval(async () => {
    if (isCloudBackupDue(settings)) {
      log('Scheduled cloud backup is due. Triggering now...');
      // We need a path for the temporary backup.
      // We can use the systemHandlers:backup:runCloud logic here indirectly or just trigger it.
      // But we are in main process, so we call backupManager to get the file first.
      const backupManager = require('./backupManager');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const tempPath = path.join(app.getPath('temp'), `auto-cloud-backup-${timestamp}.qdb`);

      // 1. Create the database file (locally in temp)
      const localResult = await backupManager.runBackup({ ...settings }, tempPath);

      if (localResult.success) {
        log('Auto-cloud backup file created. Starting upload...');
        // 2. Upload it to the cloud
        await uploadBackup(tempPath, settings, 'النظام');
      } else {
        logError('Auto-cloud backup local creation failed:', localResult.message);
      }

      // 3. Cleanup temp file
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (e) {
        logWarn(`Auto-cloud backup cleanup error: ${e.message}`);
      }
    }

    // Also process any pending queue
    processQueue();
  }, 30 * 60 * 1000);
};

/**
 * Stops the cloud-specific scheduler.
 */
const stopCloudScheduler = () => {
  if (cloudSchedulerId) {
    clearInterval(cloudSchedulerId);
    cloudSchedulerId = null;
    log('Cloud backup scheduler stopped.');
  }
};

module.exports = {
  connectGoogle,
  disconnectGoogle,
  uploadBackup,
  listCloudBackups,
  downloadBackup,
  downloadFromLink,
  deleteBackup,
  startCloudScheduler,
  stopCloudScheduler,
  isCloudBackupDue,
  processQueue
};
