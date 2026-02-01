// GitHub Auto-Update Service
const GITHUB_REPO = 'Xndr2/listening-stats';
const STORAGE_KEY = 'listening-stats:lastUpdateCheck';
const DISMISSED_KEY = 'listening-stats:dismissedVersion';
const JUST_UPDATED_KEY = 'listening-stats:justUpdated';

// Version is injected at build time by esbuild
declare const __APP_VERSION__: string;

// Install commands for different platforms
const INSTALL_CMD_LINUX = `curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/install.sh | bash`;
const INSTALL_CMD_WINDOWS = `iwr -useb 'https://raw.githubusercontent.com/${GITHUB_REPO}/main/install.ps1' | iex`;

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

// Always check for updates on startup
export function shouldCheckForUpdate(): boolean {
  return true;
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

// Get the install command for the current platform
export function getInstallCommand(): string {
  const isWindows = navigator.platform.toLowerCase().includes('win');
  return isWindows ? INSTALL_CMD_WINDOWS : INSTALL_CMD_LINUX;
}

// Copy install command to clipboard and return success
export async function copyInstallCommand(): Promise<boolean> {
  const cmd = getInstallCommand();
  try {
    await navigator.clipboard.writeText(cmd);
    return true;
  } catch (e) {
    // Fallback for older browsers
    try {
      const textarea = document.createElement('textarea');
      textarea.value = cmd;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      console.error('[ListeningStats] Failed to copy to clipboard');
      return false;
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

// Mark as just updated (called by install script or manually)
export function markAsUpdated(): void {
  localStorage.setItem(JUST_UPDATED_KEY, 'true');
}
