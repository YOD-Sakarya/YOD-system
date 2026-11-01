import { CalendarRange } from 'lucide-react';
import type { Cycle } from '../../types';

type Props = { cycles: Cycle[]; value: number | null; onChange: (cycleId: number) => void };

/** Lets everyone browse previous years; the current cycle is marked and selected by default. */
export function CycleSwitcher({ cycles, value, onChange }: Props) {
  if (cycles.length < 2) return null;
  return (
    <label className="cycle-switcher">
      <CalendarRange size={16} />
      <select aria-label="العام" value={value ?? ''} onChange={event => onChange(Number(event.target.value))}>
        {cycles.map(cycle => (
          <option key={cycle.cycleId} value={cycle.cycleId}>
            {cycle.name}
            {cycle.isCurrent ? ' (الحالي)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
