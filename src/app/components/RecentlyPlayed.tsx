// Recently Played Component
import { PlayEvent } from "../../types";
import { navigateToUri } from "../utils";

interface RecentlyPlayedProps {
  recentTracks: PlayEvent[];
}

export function RecentlyPlayed({ recentTracks }: RecentlyPlayedProps) {
  if (recentTracks.length === 0) {
    return null;
  }

  return (
    <div className="recent-section">
      <div className="recent-header">
        <h3 className="recent-title">Recently Played</h3>
      </div>
      <div className="recent-scroll">
        {recentTracks.slice(0, 12).map((t) => (
          <div
            key={`${t.trackUri}-${t.startedAt}`}
            className="recent-card"
            onClick={() => navigateToUri(t.trackUri)}
          >
            {t.albumArt ? (
              <img src={t.albumArt} className="recent-art" alt="" />
            ) : (
              <div className="recent-art" />
            )}
            <div className="recent-name">{t.trackName}</div>
            <div className="recent-meta">{t.artistName}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
