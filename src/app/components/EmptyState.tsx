// Empty State Component
import { formatDurationLong, getPeriodDisplayName } from "../../services/stats";
import { ListeningStats, TimePeriod } from "../../types";
import { PeriodTabs } from "./PeriodTabs";

interface EmptyStateProps {
  stats: ListeningStats;
  period: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
}

export function EmptyState({ stats, period, onPeriodChange }: EmptyStateProps) {
  return (
    <>
      <div className="stats-header">
        <h1 className="stats-title">Listening Stats</h1>
        <p className="stats-subtitle">Your personal music analytics</p>
      </div>

      <div className="overview-row">
        <div className="overview-card hero">
          <div className="overview-value">
            {formatDurationLong(stats.totalTimeMs)}
          </div>
          <div className="overview-label">
            No data for {getPeriodDisplayName(period)}
          </div>
          <PeriodTabs period={period} onPeriodChange={onPeriodChange} />
          <div className="overview-secondary">
            Start listening to see your stats!
          </div>
        </div>
      </div>
    </>
  );
}
