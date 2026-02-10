const fs = require('fs').promises;
const path = require('path');
const Store = require('electron-store');
const keytar = require('keytar');
const { log, error: logError } = require('./logger');

// Google Drive API constants
const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/callback';

const store = new Store();

/**
 * Generates a random string for PKCE
 */
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Base64 URL encode a string
 */
function base64URLEncode(str) {
  return str.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Initiates the Google OAuth flow
 */
async function initiateGoogleAuth() {
  try {
    if (!CLIENT_ID || CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
      throw new Error('Google Client ID not configured. Please set up your Google OAuth credentials.');
    }

    const codeVerifier = generateRandomString(128);
    const codeChallenge = base64URLEncode(require('crypto').createHash('sha256').update(codeVerifier).digest());
    
    // Store the code verifier for later use
    store.set('google_auth_code_verifier', codeVerifier);

    const authUrl = new URL('https://accounts.google.com/oauth/authenticate');
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', GOOGLE_DRIVE_SCOPES.join(' '));
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent');

    return {
      success: true,
      url: authUrl.toString(),
      codeVerifier
    };
  } catch (error) {
    logError('Error initiating Google Auth:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Exchanges authorization code for access token
 */
async function exchangeCodeForToken(authCode, codeVerifier) {
  try {
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('code', authCode);
    params.append('redirect_uri', REDIRECT_URI);
    params.append('code_verifier', codeVerifier);

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error_description || 'Failed to exchange code for token');
    }

    // Store tokens in OS keychain
    await keytar.setPassword('app-cloud-backup', 'access_token', data.access_token);
    if (data.refresh_token) {
      await keytar.setPassword('app-cloud-backup', 'refresh_token', data.refresh_token);
    }

    // Store token expiry time
    store.set('token_expiry', Date.now() + (data.expires_in * 1000));

    return {
      success: true,
      message: 'Successfully authenticated with Google'
    };
  } catch (error) {
    logError('Error exchanging code for token:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Gets valid access token (refreshes if needed)
 */
async function getValidAccessToken() {
  try {
    let accessToken = await keytar.getPassword('app-cloud-backup', 'access_token');
    const refreshToken = await keytar.getPassword('app-cloud-backup', 'refresh_token');
    const expiryTime = store.get('token_expiry', 0);

    // Check if token needs refresh
    if (!accessToken || Date.now() >= expiryTime) {
      if (!refreshToken) {
        throw new Error('No refresh token available. Please re-authenticate.');
      }

      // Refresh token
      const refreshUrl = 'https://oauth2.googleapis.com/token';
      
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('client_id', CLIENT_ID);
      params.append('client_secret', CLIENT_SECRET);
      params.append('refresh_token', refreshToken);

      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || 'Failed to refresh token');
      }

      // Update stored access token
      accessToken = data.access_token;
      await keytar.setPassword('app-cloud-backup', 'access_token', accessToken);
      
      // Update expiry time
      store.set('token_expiry', Date.now() + (data.expires_in * 1000));
    }

    return accessToken;
  } catch (error) {
    logError('Error getting valid access token:', error);
    throw error;
  }
}

/**
 * Uploads a file to Google Drive
 */
async function uploadToDrive(filePath, fileName, description = 'Cloud backup') {
  try {
    const accessToken = await getValidAccessToken();
    
    // Read the file to upload
    const fileBuffer = await fs.readFile(filePath);
    const fileSize = fileBuffer.length;

    // First, create a resumable upload session
    const metadata = {
      name: fileName,
      mimeType: 'application/octet-stream',
      description: description,
      parents: ['appDataFolder'] // Store in app-specific folder
    };

    const metadataBuffer = Buffer.from(JSON.stringify(metadata));
    
    const initUploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': fileSize,
        'X-Upload-Content-Type': 'application/octet-stream',
      },
      body: metadataBuffer
    });

    if (!initUploadResponse.ok) {
      const errorData = await initUploadResponse.json();
      throw new Error(errorData.error?.message || `Failed to initialize upload: ${initUploadResponse.status}`);
    }

    const uploadUrl = initUploadResponse.headers.get('location');

    // Upload the file content
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: fileBuffer
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      throw new Error(errorData.error?.message || `Failed to upload file: ${uploadResponse.status}`);
    }

    const driveFile = await uploadResponse.json();
    
    // Make file publicly accessible by setting permissions
    const permissionResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFile.id}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });

    if (!permissionResponse.ok) {
      logError('Failed to set file permissions, but file was uploaded successfully');
    }

    return {
      success: true,
      fileId: driveFile.id,
      fileName: driveFile.name,
      shareableLink: driveFile.webViewLink,
      size: fileSize
    };
  } catch (error) {
    logError('Error uploading to Google Drive:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Saves backup metadata to local store
 */
function saveBackupMetadata(backupInfo) {
  try {
    const backups = store.get('cloud_backups', []);
    const newBackup = {
      id: backupInfo.fileId,
      fileName: backupInfo.fileName,
      shareableLink: backupInfo.shareableLink,
      size: backupInfo.size,
      date: new Date().toISOString(),
      localFilePath: backupInfo.localFilePath
    };
    
    backups.unshift(newBackup); // Add to beginning of array
    
    store.set('cloud_backups', backups);
    
    return {
      success: true,
      message: 'Backup metadata saved successfully'
    };
  } catch (error) {
    logError('Error saving backup metadata:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Performs a manual cloud backup
 */
async function performManualCloudBackup(settings) {
  try {
    log('Starting manual cloud backup...');
    
    // First, create a local backup to compress the database
    const { runBackup } = require('./backupManager');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempBackupPath = path.join(require('os').tmpdir(), `temp-cloud-backup-${timestamp}.qdb`);
    
    const backupResult = await runBackup(settings, tempBackupPath);
    
    if (!backupResult.success) {
      throw new Error(`Local backup failed: ${backupResult.message}`);
    }

    // Upload to Google Drive
    const fileName = `cloud-backup-${timestamp}.qdb`;
    const uploadResult = await uploadToDrive(tempBackupPath, fileName, 'Cloud backup of application database');

    if (!uploadResult.success) {
      throw new Error(`Upload failed: ${uploadResult.message}`);
    }

    // Save metadata
    const metadataResult = saveBackupMetadata({
      ...uploadResult,
      localFilePath: tempBackupPath
    });

    if (!metadataResult.success) {
      logError('Failed to save backup metadata:', metadataResult.message);
    }

    // Clean up temporary file
    try {
      await fs.unlink(tempBackupPath);
    } catch (cleanupError) {
      logError('Failed to clean up temporary backup file:', cleanupError);
    }

    log('Manual cloud backup completed successfully');
    
    return {
      success: true,
      message: 'Cloud backup completed successfully',
      fileId: uploadResult.fileId,
      shareableLink: uploadResult.shareableLink
    };
  } catch (error) {
    logError('Error performing manual cloud backup:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Gets list of cloud backups
 */
function getCloudBackups() {
  try {
    const backups = store.get('cloud_backups', []);
    return {
      success: true,
      backups
    };
  } catch (error) {
    logError('Error getting cloud backups:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Deletes a cloud backup (from both Drive and local history)
 */
async function deleteCloudBackup(fileId) {
  try {
    const accessToken = await getValidAccessToken();

    // Delete from Google Drive
    const deleteResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });

    if (!deleteResponse.ok) {
      throw new Error(`Failed to delete file from Google Drive: ${deleteResponse.status}`);
    }

    // Remove from local history
    const backups = store.get('cloud_backups', []);
    const updatedBackups = backups.filter(backup => backup.id !== fileId);
    store.set('cloud_backups', updatedBackups);

    return {
      success: true,
      message: 'Backup deleted successfully'
    };
  } catch (error) {
    logError('Error deleting cloud backup:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Downloads a cloud backup from Google Drive
 */
async function downloadCloudBackup(fileId, destinationPath) {
  try {
    const accessToken = await getValidAccessToken();

    const downloadResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });

    if (!downloadResponse.ok) {
      throw new Error(`Failed to download file from Google Drive: ${downloadResponse.status}`);
    }

    const buffer = await downloadResponse.buffer();
    await fs.writeFile(destinationPath, buffer);

    return {
      success: true,
      message: 'Backup downloaded successfully',
      filePath: destinationPath
    };
  } catch (error) {
    logError('Error downloading cloud backup:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Restores from a cloud backup
 */
async function restoreFromCloudBackup(fileId, password, userId) {
  try {
    const { importDatabase } = require('./importManager');
    
    // Download the backup to a temporary location
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempDownloadPath = path.join(require('os').tmpdir(), `restore-backup-${timestamp}.qdb`);
    
    const downloadResult = await downloadCloudBackup(fileId, tempDownloadPath);
    
    if (!downloadResult.success) {
      throw new Error(`Download failed: ${downloadResult.message}`);
    }

    // Import the downloaded backup
    const importResult = await importDatabase({
      filePath: tempDownloadPath,
      password,
      userId
    });

    // Clean up temporary file
    try {
      await fs.unlink(tempDownloadPath);
    } catch (cleanupError) {
      logError('Failed to clean up temporary restore file:', cleanupError);
    }

    return importResult;
  } catch (error) {
    logError('Error restoring from cloud backup:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Checks if user is authenticated with Google
 */
async function isAuthenticatedWithGoogle() {
  try {
    const accessToken = await keytar.getPassword('app-cloud-backup', 'access_token');
    const refreshToken = await keytar.getPassword('app-cloud-backup', 'refresh_token');
    
    if (!accessToken && !refreshToken) {
      return false;
    }

    // Try to get a valid access token (this will refresh if needed)
    await getValidAccessToken();
    
    return true;
  } catch (error) {
    logError('Error checking Google authentication:', error);
    return false;
  }
}

/**
 * Signs out from Google
 */
async function signOutFromGoogle() {
  try {
    await keytar.deletePassword('app-cloud-backup', 'access_token');
    await keytar.deletePassword('app-cloud-backup', 'refresh_token');
    store.delete('token_expiry');
    store.delete('google_auth_code_verifier');
    
    return {
      success: true,
      message: 'Successfully signed out from Google'
    };
  } catch (error) {
    logError('Error signing out from Google:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Scheduler for automatic cloud backups
 */
let cloudBackupSchedulerIntervalId = null;

/**
 * Starts the cloud backup scheduler
 */
function startCloudBackupScheduler(settings) {
  stopCloudBackupScheduler(); // Stop any existing scheduler first

  if (!settings.cloud_backup_enabled) {
    log('Cloud backup scheduler is disabled.');
    return;
  }

  log(`Cloud backup scheduler started. Frequency: ${settings.cloud_backup_frequency}.`);

  // Calculate interval based on frequency
  let intervalMs = 24 * 60 * 60 * 1000; // Default to daily
  
  switch (settings.cloud_backup_frequency) {
    case 'daily':
      intervalMs = 24 * 60 * 60 * 1000; // 24 hours
      break;
    case 'weekly':
      intervalMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      break;
    case 'monthly':
      intervalMs = 30 * 24 * 60 * 60 * 1000; // 30 days (approximate)
      break;
  }

  // Check every hour if backup is due
  cloudBackupSchedulerIntervalId = setInterval(async () => {
    try {
      // Check if we're authenticated
      const authenticated = await isAuthenticatedWithGoogle();
      if (!authenticated) {
        log('Not authenticated with Google, skipping cloud backup.');
        return;
      }

      // Check if backup is due
      const isDue = await isCloudBackupDue(settings);
      if (isDue) {
        log('Cloud backup is due. Running now...');
        
        // Check network connectivity
        const isOnline = await checkNetworkConnectivity();
        if (!isOnline) {
          log('Offline. Queuing cloud backup for later.');
          
          // Add to pending backups queue
          const pendingBackups = store.get('pending_cloud_backups', []);
          pendingBackups.push({
            timestamp: new Date().toISOString(),
            status: 'queued'
          });
          store.set('pending_cloud_backups', pendingBackups);
          
          return;
        }

        // Run the cloud backup
        const result = await performManualCloudBackup(settings);
        
        if (result.success) {
          log('Scheduled cloud backup completed successfully.');
          store.set('last_cloud_backup_status', {
            success: true,
            message: 'Cloud backup completed successfully',
            timestamp: new Date().toISOString(),
          });
        } else {
          logError('Scheduled cloud backup failed:', result.message);
          store.set('last_cloud_backup_status', {
            success: false,
            message: result.message,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      logError('Error in cloud backup scheduler:', error);
    }
  }, 60 * 60 * 1000); // Check every hour
}

/**
 * Stops the cloud backup scheduler
 */
function stopCloudBackupScheduler() {
  if (cloudBackupSchedulerIntervalId) {
    clearInterval(cloudBackupSchedulerIntervalId);
    cloudBackupSchedulerIntervalId = null;
    log('Cloud backup scheduler stopped.');
  }
}

/**
 * Checks if a cloud backup is due based on frequency and last backup time
 */
async function isCloudBackupDue(settings) {
  const lastBackup = store.get('last_cloud_backup_status');
  
  if (!lastBackup?.timestamp) {
    return true; // No backup has ever run
  }

  const lastBackupTime = new Date(lastBackup.timestamp).getTime();
  const now = Date.now();
  const diffHours = (now - lastBackupTime) / (1000 * 60 * 60);

  switch (settings.cloud_backup_frequency) {
    case 'daily':
      return diffHours >= 24;
    case 'weekly':
      return diffHours >= 24 * 7;
    case 'monthly':
      return diffHours >= 24 * 30; // Approximation
    default:
      return false;
  }
}

/**
 * Checks network connectivity
 */
async function checkNetworkConnectivity() {
  try {
    const response = await fetch('https://www.google.com', { timeout: 5000 });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Processes pending cloud backups when connectivity is restored
 */
async function processPendingBackups(settings) {
  try {
    const pendingBackups = store.get('pending_cloud_backups', []);
    if (pendingBackups.length === 0) {
      return;
    }

    log(`Processing ${pendingBackups.length} pending cloud backups...`);

    for (const backup of pendingBackups) {
      try {
        const result = await performManualCloudBackup(settings);
        
        if (result.success) {
          log(`Pending backup completed successfully: ${backup.timestamp}`);
        } else {
          logError(`Pending backup failed: ${backup.timestamp}`, result.message);
          // Keep the backup in the queue for retry
          continue;
        }
      } catch (error) {
        logError(`Error processing pending backup: ${backup.timestamp}`, error);
        continue; // Continue with next backup even if this one fails
      }
    }

    // Clear the pending backups queue after processing
    store.set('pending_cloud_backups', []);

    log('Finished processing pending cloud backups.');
  } catch (error) {
    logError('Error processing pending cloud backups:', error);
  }
}

module.exports = {
  initiateGoogleAuth,
  exchangeCodeForToken,
  performManualCloudBackup,
  getCloudBackups,
  deleteCloudBackup,
  downloadCloudBackup,
  restoreFromCloudBackup,
  isAuthenticatedWithGoogle,
  signOutFromGoogle,
  startCloudBackupScheduler,
  stopCloudBackupScheduler,
  processPendingBackups,
  checkNetworkConnectivity
};