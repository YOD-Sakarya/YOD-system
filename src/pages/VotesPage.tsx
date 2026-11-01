import { useState } from 'react';
import { ChevronLeft, Plus, Vote } from 'lucide-react';
import { Empty } from '../components/ui/Empty';
import { PageHeading } from '../components/ui/PageHeading';
import { number } from '../lib/format';
import { VOTE_MANAGER_ROLE_IDS } from '../lib/roles';
import { isOpen } from '../lib/votes';
import type { Data, User, VoteSession } from '../types';

/** Vote sessions grouped by open/closed; only vote managers see the "new session" button. */
export function VotesPage({
  data,
  query,
  user,
  onCreate,
  onSelect,
}: {
  data: Data;
  query: string;
  user: User;
  onCreate: () => void;
  onSelect: (s: VoteSession) => void;
}) {
  const [filter, setFilter] = useState('all');
  const sessions = data.votes.filter(
    s =>
      `${s.title} ${s.description}`.includes(query) &&
      (filter === 'all' || (filter === 'open' ? isOpen(s) : !isOpen(s))),
  );
  return (
    <>
      <PageHeading
        title="جلسات التصويت"
        description="قرارات واضحة، ومشاركة تُحدث فرقًا."
        action={
          VOTE_MANAGER_ROLE_IDS.includes(user.roleId) && (
            <button className="button primary" onClick={onCreate}>
              <Plus size={18} />
              جلسة جديدة
            </button>
          )
        }
      />
      <div className="segmented">
        {[
          ['all', 'كل الجلسات'],
          ['open', 'مفتوحة'],
          ['closed', 'منتهية'],
        ].map(([value, label]) => (
          <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>
      <div className="ballot-grid">
        {sessions.map(s => (
          <button className="panel ballot-card" key={s.sessionId} onClick={() => onSelect(s)}>
            <div className="ballot-top">
              <span className="stat-icon blue">
                <Vote size={22} />
              </span>
              <span className={`status ${isOpen(s) ? 'success' : 'neutral'}`}>
                {isOpen(s) ? 'التصويت مفتوح' : 'انتهى التصويت'}
              </span>
            </div>
            <h2>{s.title}</h2>
            <p>{s.description}</p>
            <div className="ballot-preview">
              {s.options.map(o => (
                <div key={o.optionId}>
                  <span>{o.text}</span>
                  <b>{number(o.count)}</b>
                  <i style={{ width: `${s.voteCount ? (o.count / s.voteCount) * 100 : 0}%` }} />
                </div>
              ))}
            </div>
            <div className="ballot-footer">
              <span>{number(s.voteCount)} أصوات</span>
              <span>
                {isOpen(s) ? 'عرض الجلسة' : `القرار: ${s.decision || 'بانتظار الإغلاق'}`}
                <ChevronLeft size={16} />
              </span>
            </div>
          </button>
        ))}
      </div>
      {!sessions.length && (
        <section className="panel">
          <Empty title="لا توجد جلسات هنا" text="ستظهر جلسات التصويت عند إنشائها." />
        </section>
      )}
    </>
  );
}
