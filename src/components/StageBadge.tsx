import { STAGE_COLORS } from '../lib/utils';

interface Props {
  stage: string;
  size?: 'sm' | 'md';
}

export default function StageBadge({ stage, size = 'sm' }: Props) {
  const colors = STAGE_COLORS[stage] || STAGE_COLORS.failed;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${colors.bg} ${colors.text} ${sizeClasses}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {stage}
    </span>
  );
}
