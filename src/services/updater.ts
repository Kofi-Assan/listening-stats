// GitHub Auto-Update Service
const GITHUB_REPO = 'Xndr2/listening-stats';
const STORAGE_KEY = 'listening-stats:lastUpdateCheck';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Check once per day

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string; // Changelog
  published_at: string;
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
}

// Get current version from build
// NOTE: Keep this in sync with package.json version
export function getCurrentVersion(): string {
  return '1.0.3';
}

// Check for updates from GitHub releases
export async function checkForUpdates(): Promise<UpdateInfo> {
  const currentVersion = getCurrentVersion();
  
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    if (!response.ok) {
      throw new Error('Failed to fetch release info');
    }
    
    const release: GitHubRelease = await response.json();
    const latestVersion = release.tag_name.replace(/^v/, '');
    
    // Find the dist.zip asset
    const distAsset = release.assets.find(a => a.name === 'dist.zip' || a.name.includes('listening-stats'));
    
    const available = isNewerVersion(latestVersion, currentVersion);
    
    // Store last check time
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      checkedAt: Date.now(),
      latestVersion,
      available,
    }));
    
    return {
      available,
      currentVersion,
      latestVersion,
      changelog: release.body || 'No changelog provided.',
      downloadUrl: distAsset?.browser_download_url || null,
    };
  } catch (error) {
    console.error('[ListeningStats] Update check failed:', error);
    return {
      available: false,
      currentVersion,
      latestVersion: currentVersion,
      changelog: '',
      downloadUrl: null,
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

// Check if we should prompt for update (based on last check time)
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

// Download and apply update (manual process - user needs to extract)
export async function downloadUpdate(downloadUrl: string): Promise<void> {
  // Open download in new tab - user will need to manually install
  window.open(downloadUrl, '_blank');
  Spicetify.showNotification('Download started. Extract to CustomApps/listening-stats and run "spicetify apply"');
}
