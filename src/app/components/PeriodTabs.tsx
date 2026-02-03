// Period Tabs Component
import { TimePeriod } from "../../types";

interface PeriodTabsProps {
  period: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
}

const PERIOD_LABELS: Record<TimePeriod, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  allTime: "All Time",
};

export function PeriodTabs({ period, onPeriodChange }: PeriodTabsProps) {
  return (
    <div className="period-tabs">
      {(["today", "week", "month", "allTime"] as TimePeriod[]).map((p) => (
        <button
          key={p}
          className={`period-tab ${period === p ? "active" : ""}`}
          onClick={() => onPeriodChange(p)}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}
