// GitHub Auto-Update Service
const GITHUB_REPO = 'Xndr2/listening-stats';
const STORAGE_KEY = 'listening-stats:lastUpdateCheck';
const DISMISSED_KEY = 'listening-stats:dismissedVersion';
const JUST_UPDATED_KEY = 'listening-stats:justUpdated';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // Check every 6 hours

// Version is injected at build time by esbuild
declare const __APP_VERSION__: string;

// Node.js modules (available in Electron/Spicetify)
let fs: any = null;
let path: any = null;
let childProcess: any = null;
let os: any = null;

// Try to load Node.js modules
try {
  const nodeRequire = (window as any).require || (global as any).require;
  if (nodeRequire) {
    fs = nodeRequire('fs');
    path = nodeRequire('path');
    childProcess = nodeRequire('child_process');
    os = nodeRequire('os');
  }
} catch (e) {
  console.log('[ListeningStats] Node.js modules not available, auto-update disabled');
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string; // Changelog
  published_at: string;
  html_url: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  changelog: string;
  downloadUrl: string | null;
  releaseUrl: string | null;
}

export interface UpdateResult {
  success: boolean;
  message: string;
  needsRestart: boolean;
}

// Get current version - injected at build time from package.json
export function getCurrentVersion(): string {
  try {
    return __APP_VERSION__;
  } catch {
    return '0.0.0'; // Fallback if not injected
  }
}

// Check for updates from GitHub releases
export async function checkForUpdates(): Promise<UpdateInfo> {
  const currentVersion = getCurrentVersion();
  
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!response.ok) {
      throw new Error('Failed to fetch release info');
    }
    
    const release: GitHubRelease = await response.json();
    const latestVersion = release.tag_name.replace(/^v/, '');
    
    // Find the zip asset
    const distAsset = release.assets.find(a => 
      a.name === 'listening-stats.zip' || 
      a.name === 'dist.zip' || 
      a.name.endsWith('.zip')
    );
    
    const available = isNewerVersion(latestVersion, currentVersion);
    
    // Store last check time
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      checkedAt: Date.now(),
      latestVersion,
      available,
    }));
    
    console.log(`[ListeningStats] Version check: current=${currentVersion}, latest=${latestVersion}, update=${available}`);
    
    return {
      available,
      currentVersion,
      latestVersion,
      changelog: release.body || 'No changelog provided.',
      downloadUrl: distAsset?.browser_download_url || null,
      releaseUrl: release.html_url,
    };
  } catch (error) {
    console.error('[ListeningStats] Update check failed:', error);
    return {
      available: false,
      currentVersion,
      latestVersion: currentVersion,
      changelog: '',
      downloadUrl: null,
      releaseUrl: null,
    };
  }
}

// Compare semver versions
function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

// Check if we should check for updates (based on last check time)
export function shouldCheckForUpdate(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return true;
    
    const { checkedAt } = JSON.parse(stored);
    return Date.now() - checkedAt > CHECK_INTERVAL_MS;
  } catch {
    return true;
  }
}

// Check if user dismissed this version
export function wasVersionDismissed(version: string): boolean {
  try {
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    return dismissed === version;
  } catch {
    return false;
  }
}

// Dismiss a version (user clicked "Later")
export function dismissVersion(version: string): void {
  localStorage.setItem(DISMISSED_KEY, version);
}

// Clear dismissed version (to show update again)
export function clearDismissedVersion(): void {
  localStorage.removeItem(DISMISSED_KEY);
}

// Get cached update info
export function getCachedUpdateInfo(): { available: boolean; latestVersion: string } | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// Download update - opens download link (legacy fallback)
export function downloadUpdate(downloadUrl: string): void {
  window.open(downloadUrl, '_blank');
}

// Check if auto-update is available (Node.js modules loaded)
export function isAutoUpdateAvailable(): boolean {
  return !!(fs && path && childProcess && os);
}

// Get Spicetify CustomApps path
function getCustomAppsPath(): string | null {
  if (!os || !path || !fs) return null;
  
  const isWindows = os.platform() === 'win32';
  let configPath: string;
  
  if (isWindows) {
    configPath = path.join(os.homedir(), 'AppData', 'Roaming', 'spicetify');
  } else {
    // Linux/macOS
    configPath = path.join(os.homedir(), '.config', 'spicetify');
    if (!fs.existsSync(configPath)) {
      configPath = path.join(os.homedir(), '.spicetify');
    }
  }
  
  return path.join(configPath, 'CustomApps', 'listening-stats');
}

// Perform automatic update
export async function performAutoUpdate(downloadUrl: string): Promise<UpdateResult> {
  if (!isAutoUpdateAvailable()) {
    return {
      success: false,
      message: 'Auto-update not available in this environment',
      needsRestart: false,
    };
  }
  
  const appPath = getCustomAppsPath();
  if (!appPath) {
    return {
      success: false,
      message: 'Could not determine installation path',
      needsRestart: false,
    };
  }
  
  console.log('[ListeningStats] Starting auto-update...');
  console.log('[ListeningStats] Install path:', appPath);
  
  try {
    // Download the zip file
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Create temp directory
    const tempDir = path.join(os.tmpdir(), 'listening-stats-update');
    const tempZip = path.join(tempDir, 'update.zip');
    
    // Clean up any previous temp files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Write zip to temp
    fs.writeFileSync(tempZip, buffer);
    console.log('[ListeningStats] Downloaded update to:', tempZip);
    
    // Extract zip
    const extractDir = path.join(tempDir, 'extracted');
    fs.mkdirSync(extractDir, { recursive: true });
    
    const isWindows = os.platform() === 'win32';
    if (isWindows) {
      // Use PowerShell to extract on Windows
      childProcess.execSync(
        `powershell -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${extractDir}' -Force"`,
        { stdio: 'pipe' }
      );
    } else {
      // Use unzip on Linux/macOS
      childProcess.execSync(`unzip -q -o "${tempZip}" -d "${extractDir}"`, { stdio: 'pipe' });
    }
    
    console.log('[ListeningStats] Extracted to:', extractDir);
    
    // Find the source directory (might be nested)
    let sourceDir = extractDir;
    const manifestPath = path.join(extractDir, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
      // Check for nested directory
      const entries = fs.readdirSync(extractDir);
      for (const entry of entries) {
        const nestedPath = path.join(extractDir, entry);
        if (fs.statSync(nestedPath).isDirectory()) {
          if (fs.existsSync(path.join(nestedPath, 'manifest.json'))) {
            sourceDir = nestedPath;
            break;
          }
        }
      }
    }
    
    console.log('[ListeningStats] Source directory:', sourceDir);
    
    // Remove old installation
    if (fs.existsSync(appPath)) {
      fs.rmSync(appPath, { recursive: true, force: true });
    }
    
    // Create app directory
    fs.mkdirSync(appPath, { recursive: true });
    
    // Copy files recursively
    copyDirSync(sourceDir, appPath);
    
    console.log('[ListeningStats] Files copied to:', appPath);
    
    // Clean up temp files
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    // Mark that we just updated (so we can show success modal after restart)
    localStorage.setItem(JUST_UPDATED_KEY, 'true');
    
    // Run spicetify apply
    console.log('[ListeningStats] Running spicetify apply...');
    try {
      if (isWindows) {
        childProcess.execSync('spicetify apply', { stdio: 'pipe' });
      } else {
        childProcess.execSync('spicetify apply', { stdio: 'pipe', shell: '/bin/sh' });
      }
    } catch (applyError) {
      console.warn('[ListeningStats] spicetify apply failed, user may need to restart Spotify manually');
    }
    
    return {
      success: true,
      message: 'Update installed successfully! Restart Spotify to apply changes.',
      needsRestart: true,
    };
    
  } catch (error) {
    console.error('[ListeningStats] Auto-update failed:', error);
    return {
      success: false,
      message: `Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      needsRestart: false,
    };
  }
}

// Helper: recursively copy directory
function copyDirSync(src: string, dest: string): void {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Check if we just updated (to show success modal)
export function checkJustUpdated(): boolean {
  const justUpdated = localStorage.getItem(JUST_UPDATED_KEY) === 'true';
  if (justUpdated) {
    localStorage.removeItem(JUST_UPDATED_KEY);
  }
  return justUpdated;
}

// Get platform-specific install instructions (legacy fallback)
export function getInstallInstructions(): { windows: string; linux: string } {
  return {
    windows: `1. Extract the zip to %APPDATA%\\spicetify\\CustomApps\\listening-stats\n2. Run: spicetify apply`,
    linux: `1. Extract the zip to ~/.config/spicetify/CustomApps/listening-stats\n2. Run: spicetify apply`,
  };
}
