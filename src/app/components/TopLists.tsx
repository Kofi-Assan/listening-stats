// Top Lists Component
import { formatDuration } from "../../services/stats";
import { ListeningStats } from "../../types";
import { Icons } from "../icons";
import { getRankClass, navigateToUri } from "../utils";

const TOP_ITEMS_COUNT = 6;

interface TopListsProps {
  stats: ListeningStats;
  likedTracks: Map<string, boolean>;
  artistImages: Map<string, string>;
  onLikeToggle: (uri: string, e: React.MouseEvent) => void;
}

export function TopLists({
  stats,
  likedTracks,
  artistImages,
  onLikeToggle,
}: TopListsProps) {
  return (
    <div className="top-lists-section">
      {/* Top Tracks */}
      <div className="top-list">
        <div className="top-list-header">
          <h3 className="top-list-title">
            <span dangerouslySetInnerHTML={{ __html: Icons.music }} />
            Top Tracks
          </h3>
        </div>
        <div className="item-list">
          {stats.topTracks.slice(0, TOP_ITEMS_COUNT).map((t, i) => (
            <div
              key={t.trackUri}
              className="item-row"
              onClick={() => navigateToUri(t.trackUri)}
            >
              <span className={`item-rank ${getRankClass(i)}`}>{i + 1}</span>
              {t.albumArt && (
                <img src={t.albumArt} className="item-art" alt="" />
              )}
              <div className="item-info">
                <div className="item-name">{t.trackName}</div>
                <div className="item-meta">{t.artistName}</div>
              </div>
              <div className="item-stats">
                <span className="item-plays">{t.playCount} plays</span>
                <span className="item-time">{formatDuration(t.totalTimeMs)}</span>
              </div>
              <button
                className={`heart-btn ${likedTracks.get(t.trackUri) ? "liked" : ""}`}
                onClick={(e) => onLikeToggle(t.trackUri, e)}
                dangerouslySetInnerHTML={{
                  __html: likedTracks.get(t.trackUri)
                    ? Icons.heartFilled
                    : Icons.heart,
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Top Artists */}
      <div className="top-list">
        <div className="top-list-header">
          <h3 className="top-list-title">
            <span dangerouslySetInnerHTML={{ __html: Icons.users }} />
            Top Artists
          </h3>
        </div>
        <div className="item-list">
          {stats.topArtists.slice(0, TOP_ITEMS_COUNT).map((a, i) => {
            const img = artistImages.get(a.artistUri) || a.artistImage;
            return (
              <div
                key={a.artistUri || a.artistName}
                className="item-row"
                onClick={() => a.artistUri && navigateToUri(a.artistUri)}
              >
                <span className={`item-rank ${getRankClass(i)}`}>{i + 1}</span>
                {img && <img src={img} className="item-art round" alt="" />}
                <div className="item-info">
                  <div className="item-name">{a.artistName}</div>
                  <div className="item-meta">{a.playCount} plays</div>
                </div>
                <div className="item-stats">
                  <span className="item-time">{formatDuration(a.totalTimeMs)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Albums */}
      <div className="top-list">
        <div className="top-list-header">
          <h3 className="top-list-title">
            <span dangerouslySetInnerHTML={{ __html: Icons.album }} />
            Top Albums
          </h3>
        </div>
        <div className="item-list">
          {stats.topAlbums.slice(0, TOP_ITEMS_COUNT).map((a, i) => (
            <div
              key={a.albumUri}
              className="item-row"
              onClick={() => navigateToUri(a.albumUri)}
            >
              <span className={`item-rank ${getRankClass(i)}`}>{i + 1}</span>
              {a.albumArt && (
                <img src={a.albumArt} className="item-art" alt="" />
              )}
              <div className="item-info">
                <div className="item-name">{a.albumName}</div>
                <div className="item-meta">{a.artistName}</div>
              </div>
              <div className="item-stats">
                <span className="item-plays">{a.playCount} plays</span>
                <span className="item-time">{formatDuration(a.totalTimeMs)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
