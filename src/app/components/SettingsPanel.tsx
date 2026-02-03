// Settings Panel Component
import { clearApiCaches, getRateLimitRemaining, resetRateLimit } from "../../services/spotify-api";
import { clearAllData } from "../../services/storage";
import { runBackgroundEnrichment } from "../../services/tracker";

interface SettingsPanelProps {
  apiAvailable: boolean;
  onRefresh: () => void;
  onCheckUpdates: () => void;
  onDataCleared: () => void;
}

export function SettingsPanel({
  apiAvailable,
  onRefresh,
  onCheckUpdates,
  onDataCleared,
}: SettingsPanelProps) {
  return (
    <div className="settings-panel">
      <div className="settings-row">
        <button className="footer-btn" onClick={onRefresh}>
          Refresh
        </button>
        <button
          className="footer-btn"
          onClick={async () => {
            await runBackgroundEnrichment(true);
            onRefresh();
            Spicetify.showNotification("Data enriched");
          }}
        >
          Enrich Data
        </button>
        <button
          className="footer-btn"
          onClick={() => {
            resetRateLimit();
            clearApiCaches();
            Spicetify.showNotification("Cache cleared");
          }}
        >
          Clear Cache
        </button>
        <button className="footer-btn" onClick={onCheckUpdates}>
          Check Updates
        </button>
        <button
          className="footer-btn danger"
          onClick={async () => {
            if (confirm("Delete all listening data?")) {
              await clearAllData();
              onDataCleared();
            }
          }}
        >
          Reset Data
        </button>
      </div>
      <div className="api-status">
        <span className={`status-dot ${apiAvailable ? "green" : "red"}`} />
        API:{" "}
        {apiAvailable
          ? "Available"
          : `Limited (${Math.ceil(getRateLimitRemaining() / 60)}m)`}
      </div>
    </div>
  );
}
