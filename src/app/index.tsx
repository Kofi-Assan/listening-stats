// Main Stats Page Component
import { isApiAvailable } from "../services/spotify-api";
import { calculateStats } from "../services/stats";
import {
  checkForUpdates,
  copyInstallCommand,
  getCurrentVersion,
  getInstallCommand,
  UpdateInfo,
} from "../services/updater";
import { ListeningStats, TimePeriod } from "../types";
import { injectStyles } from "./styles";
import { checkLikedTracks, fetchArtistImages, toggleLike } from "./utils";
import {
  UpdateBanner,
  Footer,
  SettingsPanel,
  OverviewCards,
  TopLists,
  ActivityChart,
  RecentlyPlayed,
  EmptyState,
} from "./components";

const VERSION = getCurrentVersion();

interface State {
  period: TimePeriod;
  stats: ListeningStats | null;
  loading: boolean;
  likedTracks: Map<string, boolean>;
  artistImages: Map<string, string>;
  updateInfo: UpdateInfo | null;
  showUpdateBanner: boolean;
  commandCopied: boolean;
  showSettings: boolean;
  apiAvailable: boolean;
  lastUpdateTimestamp: number;
}

class StatsPage extends Spicetify.React.Component<{}, State> {
  private pollInterval: number | null = null;

  constructor(props: {}) {
    super(props);
    this.state = {
      period: "today",
      stats: null,
      loading: true,
      likedTracks: new Map(),
      artistImages: new Map(),
      updateInfo: null,
      showUpdateBanner: false,
      commandCopied: false,
      showSettings: false,
      apiAvailable: true,
      lastUpdateTimestamp: 0,
    };
  }

  componentDidMount() {
    injectStyles();
    this.loadStats();
    this.checkForUpdateOnLoad();

    this.pollInterval = window.setInterval(() => {
      const ts = localStorage.getItem("listening-stats:lastUpdate");
      if (ts) {
        const t = parseInt(ts, 10);
        if (t > this.state.lastUpdateTimestamp) {
          this.setState({ lastUpdateTimestamp: t });
          this.loadStats();
        }
      }
      this.setState({ apiAvailable: isApiAvailable() });
    }, 2000);
  }

  componentWillUnmount() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  componentDidUpdate(_: {}, prev: State) {
    if (prev.period !== this.state.period) this.loadStats();
  }

  checkForUpdateOnLoad = async () => {
    const info = await checkForUpdates();
    if (info.available) {
      this.setState({ updateInfo: info, showUpdateBanner: true });
    }
  };

  checkUpdatesManual = async () => {
    const info = await checkForUpdates();
    this.setState({ updateInfo: info, commandCopied: false });

    if (info.available) {
      this.setState({ showUpdateBanner: true });
    } else {
      Spicetify.showNotification("You are on the latest version!");
    }
  };

  copyUpdateCommand = async () => {
    const copied = await copyInstallCommand();
    if (copied) {
      this.setState({ commandCopied: true });
      Spicetify.showNotification("Command copied! Paste in your terminal.");
    } else {
      Spicetify.showNotification("Failed to copy. Check console for command.", true);
      console.log("[ListeningStats] Install command:", getInstallCommand());
    }
  };

  dismissUpdateBanner = () => {
    this.setState({ showUpdateBanner: false });
  };

  loadStats = async () => {
    this.setState({ loading: true });
    try {
      const data = await calculateStats(this.state.period);
      this.setState({ stats: data, loading: false });

      if (data.topTracks.length > 0) {
        const uris = data.topTracks.map((t) => t.trackUri);
        const liked = await checkLikedTracks(uris);
        this.setState({ likedTracks: liked });
      }

      if (data.topArtists.length > 0) {
        const uris = data.topArtists.map((a) => a.artistUri).filter(Boolean);
        const images = await fetchArtistImages(uris);
        this.setState({ artistImages: images });
      }
    } catch (e) {
      console.error("[ListeningStats] Load failed:", e);
      this.setState({ loading: false });
    }
  };

  handleLikeToggle = async (uri: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = this.state.likedTracks.get(uri) || false;
    const newVal = await toggleLike(uri, current);
    const m = new Map(this.state.likedTracks);
    m.set(uri, newVal);
    this.setState({ likedTracks: m });
  };

  handlePeriodChange = (period: TimePeriod) => {
    this.setState({ period });
  };

  render() {
    const {
      period,
      stats,
      loading,
      likedTracks,
      artistImages,
      updateInfo,
      showUpdateBanner,
      commandCopied,
      showSettings,
      apiAvailable,
    } = this.state;

    // Update UI takes absolute priority
    if (showUpdateBanner && updateInfo) {
      return (
        <UpdateBanner
          updateInfo={updateInfo}
          commandCopied={commandCopied}
          onDismiss={this.dismissUpdateBanner}
          onCopyCommand={this.copyUpdateCommand}
        />
      );
    }

    if (loading) {
      return (
        <div className="stats-page">
          <div className="loading">Loading...</div>
        </div>
      );
    }

    // Empty state
    if (!stats || stats.trackCount === 0) {
      return (
        <div className="stats-page">
          <EmptyState
            stats={stats}
            period={period}
            onPeriodChange={this.handlePeriodChange}
          />
          <Footer
            version={VERSION}
            showSettings={showSettings}
            updateInfo={updateInfo}
            onToggleSettings={() => this.setState({ showSettings: !showSettings })}
            onShowUpdate={() => this.setState({ showUpdateBanner: true })}
          />
          {showSettings && (
            <SettingsPanel
              apiAvailable={apiAvailable}
              onRefresh={this.loadStats}
              onCheckUpdates={this.checkUpdatesManual}
              onDataCleared={() => this.setState({ stats: null })}
            />
          )}
        </div>
      );
    }

    return (
      <div className="stats-page">
        {/* Header */}
        <div className="stats-header">
          <h1 className="stats-title">Listening Stats</h1>
          <p className="stats-subtitle">Your personal music analytics</p>
        </div>

        <OverviewCards
          stats={stats}
          period={period}
          onPeriodChange={this.handlePeriodChange}
        />

        <TopLists
          stats={stats}
          likedTracks={likedTracks}
          artistImages={artistImages}
          onLikeToggle={this.handleLikeToggle}
        />

        <ActivityChart
          hourlyDistribution={stats.hourlyDistribution}
          peakHour={stats.peakHour}
        />

        <RecentlyPlayed recentTracks={stats.recentTracks} />

        <Footer
          version={VERSION}
          showSettings={showSettings}
          updateInfo={updateInfo}
          onToggleSettings={() => this.setState({ showSettings: !showSettings })}
          onShowUpdate={() =>
            this.setState({ showUpdateBanner: true, commandCopied: false })
          }
        />

        {showSettings && (
          <SettingsPanel
            apiAvailable={apiAvailable}
            onRefresh={this.loadStats}
            onCheckUpdates={this.checkUpdatesManual}
            onDataCleared={() => this.setState({ stats: null })}
          />
        )}
      </div>
    );
  }
}

export default StatsPage;
