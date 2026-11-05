import { ChevronLeft, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { PageHeading } from '../components/ui/PageHeading';
import { number } from '../lib/format';
import { isCommitteeRole } from '../lib/roles';
import type { Data } from '../types';

/** Committees with their document counts and which document types each may create. */
export function CommitteesPage({ data }: { data: Data }) {
  return (
    <>
      <PageHeading
        title="اللجان والصلاحيات"
        description="مسؤوليات واضحة ومساحة لكل لجنة. أنواع المستندات مرتبطة بالصلاحيات المحفوظة في النظام."
      />
      <div className="committees-grid">
        {data.catalog.roles.filter(isCommitteeRole).map(r => (
          <section className="panel committee-card" key={r.roleId}>
            <div className="committee-card-top">
              <span className={`committee-avatar dot-${r.roleId % 4}`}>
                <Users size={23} />
              </span>
              <span>{number(data.documents.filter(d => d.roleId === r.roleId).length)} مستندات</span>
            </div>
            <h2>{r.roleName}</h2>
            <div className="permission-tags">
              {data.catalog.permissions
                .filter(p => p.roleId === r.roleId)
                .map(p => (
                  <span key={p.docTypeId}>{data.catalog.types.find(t => t.docTypeId === p.docTypeId)?.typeName}</span>
                ))}
              {!data.catalog.permissions.some(p => p.roleId === r.roleId) && (
                <small className="muted">قراءة ومتابعة أعمال الاتحاد</small>
              )}
            </div>
            <NavLink className="text-link" to={`/documents?role=${r.roleId}`}>
              عرض المستندات <ChevronLeft size={16} />
            </NavLink>
          </section>
        ))}
      </div>
    </>
  );
}
