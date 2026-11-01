import { useEffect, useState } from 'react';
import { Plus, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DocumentTable } from '../components/documents/DocumentTable';
import { PageHeading } from '../components/ui/PageHeading';
import { matchesDocument } from '../lib/documents';
import { number } from '../lib/format';
import { PROPOSAL_TYPE_ID, isCommitteeRole } from '../lib/roles';
import type { Data, Document } from '../types';

/** Document library with status/type/committee/quarter filters and pagination; `reviews` shows proposals only. */
export function DocumentsPage({
  data,
  query,
  loading,
  reviews = false,
  onUpload,
  onDocument,
}: {
  data: Data;
  query: string;
  loading: boolean;
  reviews?: boolean;
  onUpload: () => void;
  onDocument: (d: Document) => void;
}) {
  const location = useLocation(),
    navigate = useNavigate();
  const role = new URLSearchParams(location.search).get('role') || '';
  const [status, setStatus] = useState(''),
    [type, setType] = useState(''),
    [quarter, setQuarter] = useState(''),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status, type, quarter, search, query, role, reviews]);
  const docs = data.documents.filter(
    d =>
      (!reviews || d.docTypeId === PROPOSAL_TYPE_ID) &&
      (!role || d.roleId === Number(role)) &&
      (!status || d.status === status) &&
      (!type || d.docTypeId === Number(type)) &&
      (!quarter || d.quarterId === Number(quarter)) &&
      matchesDocument(d, query) &&
      matchesDocument(d, search),
  );
  const roleName = data.catalog.roles.find(r => String(r.roleId) === role)?.roleName;
  const pages = Math.max(1, Math.ceil(docs.length / 8)),
    current = Math.min(page, pages);
  return (
    <>
      <PageHeading
        title={reviews ? 'المراجعات' : roleName ? `مستندات ${roleName}` : 'مكتبة المستندات'}
        description={
          reviews
            ? 'راجع التصورات وتابع الموافقات قبل الانتقال إلى التنفيذ.'
            : 'وثائق الاتحاد، منظّمة حسب اللجان ونوع المستند.'
        }
        action={
          !reviews && (
            <button className="button primary" onClick={onUpload}>
              <Plus size={18} />
              إضافة مستند
            </button>
          )
        }
      />
      {reviews && (
        <div className="review-info">
          <ShieldCheck size={21} />
          <p>
            تحتاج التصورات إلى مراجعة الرئيس والأمين العام والمسؤول المالي. تُعتمد النتيجة بعد اكتمال المراجعات الثلاث.
          </p>
        </div>
      )}
      <section className="panel">
        <div className="document-tabs">
          <button className={!status ? 'active' : ''} onClick={() => setStatus('')}>
            جميع {reviews ? 'التصورات' : 'المستندات'}
            <span>{number(data.documents.filter(d => !reviews || d.docTypeId === PROPOSAL_TYPE_ID).length)}</span>
          </button>
          <button className={status === 'قيد المراجعة' ? 'active' : ''} onClick={() => setStatus('قيد المراجعة')}>
            قيد المراجعة
          </button>
          <button className={status === 'مقبول' ? 'active' : ''} onClick={() => setStatus('مقبول')}>
            مقبول
          </button>
          <button className={status === 'مرفوض' ? 'active' : ''} onClick={() => setStatus('مرفوض')}>
            مرفوض
          </button>
        </div>
        <div className="filters">
          <label className="table-search">
            <Search size={17} />
            <input
              aria-label="البحث عن مستند"
              placeholder="ابحث باسم المستند أو اللجنة…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
          <SlidersHorizontal size={17} className="muted" />
          {!reviews && (
            <select aria-label="نوع المستند" value={type} onChange={e => setType(e.target.value)}>
              <option value="">كل الأنواع</option>
              {data.catalog.types.map(t => (
                <option key={t.docTypeId} value={t.docTypeId}>
                  {t.typeName}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="اللجنة"
            value={role}
            onChange={e => navigate(e.target.value ? `?role=${e.target.value}` : location.pathname)}
          >
            <option value="">كل اللجان</option>
            {data.catalog.roles.filter(isCommitteeRole).map(r => (
              <option key={r.roleId} value={r.roleId}>
                {r.roleName}
              </option>
            ))}
          </select>
          <select aria-label="الربع" value={quarter} onChange={e => setQuarter(e.target.value)}>
            <option value="">كل الأرباع</option>
            {data.catalog.quarters.map(q => (
              <option key={q.quarterId} value={q.quarterId}>
                {q.quarterName}
              </option>
            ))}
          </select>
        </div>
        <DocumentTable documents={docs.slice((current - 1) * 8, current * 8)} onSelect={onDocument} loading={loading} />
        <div className="table-pagination">
          <span>{number(docs.length)} مستندات</span>
          <div>
            <button
              className="button secondary small-button"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              السابق
            </button>
            <span>
              {number(current)} من {number(pages)}
            </span>
            <button
              className="button secondary small-button"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              التالي
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
