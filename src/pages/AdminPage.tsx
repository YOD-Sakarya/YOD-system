import { useSearchParams } from 'react-router-dom';
import { PageHeading } from '../components/ui/PageHeading';
import { CyclesPanel } from '../features/admin/CyclesPanel';
import { StoragePanel } from '../features/admin/StoragePanel';
import { UsersPanel } from '../features/admin/UsersPanel';
import type { Data, StorageReport } from '../types';

type Props = {
  data: Data;
  query: string;
  storage: { report: StorageReport | null; error: string; loading: boolean; reload: () => void };
  onCyclesChanged: () => Promise<void>;
};

const tabs = [
  { id: 'users', label: 'المستخدمون' },
  { id: 'cycles', label: 'الأعوام' },
  { id: 'storage', label: 'المساحة' },
] as const;

/** Developer console: users, yearly cycles and storage. The active tab lives in the URL (?tab=). */
export function AdminPage({ data, query, storage, onCyclesChanged }: Props) {
  const [params, setParams] = useSearchParams();
  const active = tabs.find(tab => tab.id === params.get('tab'))?.id ?? 'users';
  return (
    <>
      <PageHeading title="لوحة المطوّر" description="إدارة المستخدمين والأعوام والمساحة في مكان واحد." />
      <div className="segmented" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            className={active === tab.id ? 'active' : ''}
            onClick={() => setParams({ tab: tab.id })}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active === 'users' && <UsersPanel roles={data.catalog.roles} query={query} />}
      {active === 'cycles' && <CyclesPanel cycles={data.cycles} onChanged={onCyclesChanged} />}
      {active === 'storage' && (
        <StoragePanel
          report={storage.report}
          error={storage.error}
          loading={storage.loading}
          onRefresh={storage.reload}
        />
      )}
    </>
  );
}
