import { Link } from 'react-router-dom';
import { HardDrive } from 'lucide-react';
import { levelMessage, percentText, worstUsage } from '../../lib/storage';
import type { StorageReport } from '../../types';

/** Compact storage bar in the top bar, shown to the developer only. Links to the storage tab. */
export function StorageAlert({ report }: { report: StorageReport | null }) {
  const worst = worstUsage(report);
  if (!worst) return null;
  return (
    <Link
      to="/admin?tab=storage"
      className={`storage-alert usage-${worst.level}`}
      title={`${worst.label}: ${levelMessage[worst.level]}`}
    >
      <HardDrive size={16} />
      <span className="usage-track" aria-hidden="true">
        <i style={{ width: `${Math.min(100, worst.percent)}%` }} />
      </span>
      <b>{percentText(worst.percent)}</b>
      {worst.level !== 'ok' && <span className="storage-alert-text">{levelMessage[worst.level]}</span>}
    </Link>
  );
}
