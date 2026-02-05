import { qualityColor } from '../lib/utils';

interface Props {
  score: number | null;
  showLabel?: boolean;
}

export default function QualityBar({ score, showLabel = true }: Props) {
  if (score === null) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${qualityColor(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && <span className="text-xs text-gray-500 tabular-nums">{pct}%</span>}
    </div>
  );
}
