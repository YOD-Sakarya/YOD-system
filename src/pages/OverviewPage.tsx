import {
  ArrowLeft,
  ArrowUpLeft,
  CalendarDays,
  ChevronLeft,
  ClipboardCheck,
  Files,
  Plus,
  ShieldCheck,
  Vote,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { DocumentTable } from '../components/documents/DocumentTable';
import { PageHeading } from '../components/ui/PageHeading';
import { date, number } from '../lib/format';
import { isOpen } from '../lib/votes';
import type { Data, Document, User, VoteSession } from '../types';

/** Landing page: key counts, latest documents, upcoming events and the open vote session. */
export function OverviewPage({
  data,
  user,
  loading,
  onUpload,
  readOnly = false,
  onDocument,
  onVote,
}: {
  data: Data;
  user: User;
  loading: boolean;
  onUpload: () => void;
  readOnly?: boolean;
  onDocument: (d: Document) => void;
  onVote: (s: VoteSession) => void;
}) {
  const navigate = useNavigate(),
    pending = data.documents.filter(d => d.status === 'قيد المراجعة');
  const now = new Date(),
    events = data.documents
      .filter(d => new Date(d.eventDate) >= new Date(now.toDateString()))
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const monthEvents = data.documents.filter(d => {
    const dt = new Date(d.eventDate);
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  });
  const openVotes = data.votes.filter(isOpen);
  const stats = [
    {
      label: 'مستند في مساحة العمل',
      value: data.documents.length,
      icon: Files,
      className: 'red',
      to: '/documents',
      note: 'الوثائق والتقارير والخطط',
    },
    {
      label: 'مستند قيد المراجعة',
      value: pending.length,
      icon: ClipboardCheck,
      className: 'amber',
      to: '/reviews',
      note: 'بانتظار استكمال الموافقات',
    },
    {
      label: 'جلسة تصويت مفتوحة',
      value: openVotes.length,
      icon: Vote,
      className: 'blue',
      to: '/votes',
      note: 'شارك بصوتك في القرارات',
    },
    {
      label: 'فعالية هذا الشهر',
      value: monthEvents.length,
      icon: CalendarDays,
      className: 'green',
      to: '/calendar',
      note: date(now.toISOString(), { month: 'long', day: undefined, year: 'numeric' }),
    },
  ];
  return (
    <>
      <div className="today-line">
        <span className="live-dot" />
        {date(now.toISOString(), { weekday: 'long', year: 'numeric' })}
      </div>
      <PageHeading
        title={`أهلًا، ${user.fullName.split(' ')[0]}`}
        description="إليك ما يجري في الاتحاد. لنُكمل ما بدأناه معًا."
        action={
          !readOnly && (
            <button className="button primary" onClick={onUpload}>
              <Plus size={18} />
              إضافة مستند
            </button>
          )
        }
      />
      <div className="stats-grid">
        {stats.map(s => (
          <button className="stat" key={s.to} onClick={() => navigate(s.to)}>
            <span className={`stat-icon ${s.className}`}>
              <s.icon size={21} />
            </span>
            <span className="stat-value">{loading ? '…' : number(s.value)}</span>
            <strong>{s.label}</strong>
            <small>{s.note}</small>
            <ArrowUpLeft size={16} className="stat-arrow" />
          </button>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel document-panel">
          <div className="panel-heading">
            <div>
              <h2>آخر المستندات</h2>
              <p>آخر ما أُضيف إلى مساحات اللجان</p>
            </div>
            <NavLink className="text-link" to="/documents">
              عرض الكل <ChevronLeft size={16} />
            </NavLink>
          </div>
          <DocumentTable documents={data.documents.slice(0, 6)} onSelect={onDocument} loading={loading} compact />
        </section>
        <aside className="agenda-rail">
          <section className="panel">
            <div className="panel-heading">
              <h2>على جدول الاتحاد</h2>
              <CalendarDays size={19} className="muted" />
            </div>
            <div className="agenda-list">
              {events.slice(0, 3).map(d => (
                <button className="agenda-item" onClick={() => onDocument(d)} key={d.docId}>
                  <span className="date-tile">
                    <strong>{number(new Date(d.eventDate).getDate())}</strong>
                    <small>{date(d.eventDate, { month: 'short', day: undefined })}</small>
                  </span>
                  <span>
                    <strong>{d.title}</strong>
                    <small>{d.roleName}</small>
                  </span>
                  <ChevronLeft size={15} />
                </button>
              ))}
              {!events.length && <p className="quiet-empty">لا توجد فعاليات قادمة.</p>}
            </div>
            <NavLink to="/calendar" className="panel-bottom-link">
              فتح التقويم <ChevronLeft size={15} />
            </NavLink>
          </section>
          <section className="vote-callout">
            <span className="callout-icon">
              <Vote size={22} />
            </span>
            <h2>صوتك يصنع القرار</h2>
            {openVotes.length ? (
              <>
                <p>{openVotes[0].title}</p>
                <div className="vote-callout-meta">
                  <span className="live-dot" />
                  التصويت متاح <span>{number(openVotes[0].voteCount)} أصوات</span>
                </div>
                <button className="button light full" onClick={() => onVote(openVotes[0])}>
                  عرض جلسة التصويت <ArrowLeft size={16} />
                </button>
              </>
            ) : (
              <>
                <p>ستظهر هنا جلسات التصويت الجديدة عند فتحها.</p>
                <NavLink className="button light full" to="/votes">
                  عرض الجلسات <ArrowLeft size={16} />
                </NavLink>
              </>
            )}
          </section>
        </aside>
      </div>
      <section className="review-strip">
        <span className="review-strip-icon">
          <ShieldCheck size={25} />
        </span>
        <div>
          <h3>خطوة أقرب إلى التنفيذ</h3>
          <p>
            {pending.length
              ? `${number(pending.length)} مستندات تنتظر استكمال مراجعة الرئيس والأمين العام والمسؤول المالي.`
              : 'لا توجد مستندات معلّقة في المراجعات حاليًا.'}
          </p>
        </div>
        <NavLink className="button secondary" to="/reviews">
          متابعة المراجعات <ChevronLeft size={16} />
        </NavLink>
      </section>
    </>
  );
}
