import { formatBytes, levelMessage, percentText } from '../../lib/storage';
import type { Usage } from '../../types';

/** Progress bar for one storage area; colour follows the level (ok / warning / critical / full). */
export function UsageBar({ title, usage, detail }: { title: string; usage: Usage; detail?: string }) {
  return (
    <div className={`usage usage-${usage.level}`}>
      <div className="usage-head">
        <strong>{title}</strong>
        <span>
          {formatBytes(usage.usedBytes)} من {formatBytes(usage.limitBytes)} · {percentText(usage.percent)}
        </span>
      </div>
      <div
        className="usage-track"
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(usage.percent))}
      >
        <i style={{ width: `${Math.min(100, usage.percent)}%` }} />
      </div>
      <small>
        {levelMessage[usage.level]}
        {detail ? ` · ${detail}` : ''}
      </small>
    </div>
  );
}
