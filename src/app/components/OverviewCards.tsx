// Overview Cards Component
import { formatDurationLong } from "../../services/stats";
import { ListeningStats } from "../../types";
import { estimateArtistPayout } from "../utils";
import { PeriodTabs } from "./PeriodTabs";
import { TimePeriod } from "../../types";

interface OverviewCardsProps {
  stats: ListeningStats;
  period: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
}

export function OverviewCards({ stats, period, onPeriodChange }: OverviewCardsProps) {
  const payout = estimateArtistPayout(stats.trackCount);

  return (
    <div className="overview-row">
      {/* Hero - Time Listened */}
      <div className="overview-card hero">
        <div className="overview-value">{formatDurationLong(stats.totalTimeMs)}</div>
        <div className="overview-label">Time Listened</div>
        <PeriodTabs period={period} onPeriodChange={onPeriodChange} />
        <div className="overview-secondary">
          <div className="overview-stat">
            <div className="overview-stat-value">{stats.trackCount}</div>
            <div className="overview-stat-label">Tracks</div>
          </div>
          <div className="overview-stat">
            <div className="overview-stat-value">{stats.uniqueArtistCount}</div>
            <div className="overview-stat-label">Artists</div>
          </div>
          <div className="overview-stat">
            <div className="overview-stat-value">{stats.uniqueTrackCount}</div>
            <div className="overview-stat-label">Unique</div>
          </div>
        </div>
      </div>

      {/* 4 info cards */}
      <div className="overview-card-list">
        {/* Payout */}
        <div className="overview-card">
          <div className="stat-colored">
            <div className="stat-text">
              <div className="overview-value green">${payout}</div>
              <div className="overview-label">Spotify paid artists</div>
              <div className="overview-label-tooltip">
                From you listening to their music!
              </div>
            </div>
          </div>
        </div>

        {/* Streak */}
        <div className="overview-card">
          <div className="stat-colored">
            <div className="stat-text">
              <div className="overview-value orange">{stats.streakDays}</div>
              <div className="overview-label">Day Streak</div>
              <div className="overview-label-tooltip">
                Resets at midnight local time.
              </div>
            </div>
          </div>
        </div>

        {/* New Artists */}
        <div className="overview-card">
          <div className="stat-colored">
            <div className="stat-text">
              <div className="overview-value purple">{stats.newArtistsCount}</div>
              <div className="overview-label">New Artists</div>
              <div className="overview-label-tooltip">
                You're cool if this is high!
              </div>
            </div>
          </div>
        </div>

        {/* Skip Rate */}
        <div className="overview-card">
          <div className="stat-colored">
            <div className="stat-text">
              <div className="overview-value red">
                {Math.floor(stats.skipRate * 100)}%
              </div>
              <div className="overview-label">Skip Rate</div>
              <div className="overview-label-tooltip">
                Get this as low as possible!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
