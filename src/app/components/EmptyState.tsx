// Empty State Component
import { formatDurationLong, getPeriodDisplayName } from "../../services/stats";
import { ListeningStats, TimePeriod } from "../../types";
import { Header } from "./Header";
import { PeriodTabs } from "./PeriodTabs";

interface EmptyStateProps {
  stats: ListeningStats;
  period: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
}

export function EmptyState({ stats, period, onPeriodChange }: EmptyStateProps) {
  return (
    <>
      <Header />

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
