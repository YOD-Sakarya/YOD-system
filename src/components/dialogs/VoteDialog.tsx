import { useState } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import { api, json } from '../../lib/api';
import { date, number } from '../../lib/format';
import { VOTE_MANAGER_ROLE_IDS } from '../../lib/roles';
import { isOpen } from '../../lib/votes';
import type { User, VoteSession } from '../../types';
import { Modal } from '../ui/Modal';
import { errorText, PreviewNote, type DialogProps } from './shared';

/** Cast or change a vote; managers can also close (finalise the result) or delete the session. */
export function VoteDialog({
  session: s,
  user,
  preview,
  onClose,
  onSaved,
}: DialogProps & { session: VoteSession; user: User }) {
  const [selected, setSelected] = useState(s.myOptionId || 0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState('');
  const [comment, setComment] = useState(s.myComment || '');
  const open = isOpen(s),
    manage = VOTE_MANAGER_ROLE_IDS.includes(user.roleId) || s.createdByUserId === user.userId;
  async function action(kind: 'vote' | 'close' | 'delete') {
    if (preview) return;
    setBusy(true);
    setError('');
    try {
      await api(`/votes/${s.sessionId}${kind === 'delete' ? '' : `/${kind}`}`, {
        method: kind === 'close' ? 'PUT' : kind === 'delete' ? 'DELETE' : 'POST',
        ...(kind === 'vote' ? { body: json({ optionId: selected, comment }) } : {}),
      });
      await onSaved(
        kind === 'vote' ? 'تم حفظ صوتك.' : kind === 'close' ? 'تم إغلاق الجلسة واعتماد النتيجة.' : 'تم حذف الجلسة.',
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="جلسة التصويت" onClose={onClose} busy={busy}>
      <div className="modal-body">
        {preview && <PreviewNote />}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <span className={`status ${open ? 'success' : 'neutral'}`}>{open ? 'التصويت مفتوح' : 'التصويت منتهٍ'}</span>
        <h3 className="vote-dialog-title">{s.title}</h3>
        <p className="muted">{s.description}</p>
        <p className="small-text muted">
          بواسطة {s.createdByName}
          {s.closedAt && ` · ${open ? 'يغلق' : 'موعد الإغلاق'} ${date(s.closedAt, { year: 'numeric' })}`}
        </p>
        <fieldset className="ballot-options">
          <legend>خيارات التصويت</legend>
          {s.options.map(o => (
            <label key={o.optionId} className={selected === o.optionId ? 'selected' : ''}>
              <span className="option-top">
                <input
                  type="radio"
                  name="vote"
                  value={o.optionId}
                  checked={selected === o.optionId}
                  disabled={!open || busy}
                  onChange={() => setSelected(o.optionId)}
                />
                <strong>{o.text}</strong>
                <b>{number(o.count)} أصوات</b>
              </span>
              <span className="result-track">
                <i style={{ width: `${s.voteCount ? (o.count / s.voteCount) * 100 : 0}%` }} />
              </span>
            </label>
          ))}
        </fieldset>
        <p className="small-text muted">{number(s.voteCount)} أصوات مسجلة. يمكنك تغيير صوتك ما دامت الجلسة مفتوحة.</p>
        {open && (
          <div className="form-stack">
            <label>
              تعليقك (اختياري)
              <textarea
                rows={2}
                maxLength={4000}
                value={comment}
                onChange={event => setComment(event.target.value)}
                disabled={busy || preview}
                placeholder="أضف ملاحظة مرتبطة بصوتك…"
              />
            </label>
          </div>
        )}
        {!open && s.decision && <p className="form-notice">القرار: {s.decision}</p>}
        {open && (
          <button
            className="button primary full"
            disabled={busy || !selected || preview}
            onClick={() => action('vote')}
          >
            {busy && <LoaderCircle className="spin" size={17} />}
            {s.myOptionId ? 'تحديث صوتي' : 'حفظ صوتي'}
          </button>
        )}
        {manage && (
          <div className="detail-actions">
            {s.status === 'مفتوحة' && (
              <button className="button secondary" disabled={busy || preview} onClick={() => setConfirm('close')}>
                إغلاق الجلسة واعتماد النتيجة
              </button>
            )}
            <button className="button danger-button" disabled={busy || preview} onClick={() => setConfirm('delete')}>
              <Trash2 size={16} />
              حذف الجلسة
            </button>
          </div>
        )}
        {confirm && (
          <div className="delete-confirm" role="alert">
            <p>
              {confirm === 'delete'
                ? 'سيتم حذف الجلسة وجميع أصواتها. هل تريد المتابعة؟'
                : 'سيتوقف التصويت وتُعتمد النتيجة الحالية. هل تريد المتابعة؟'}
            </p>
            <button
              className="button danger-solid"
              disabled={busy}
              onClick={() => action(confirm as 'close' | 'delete')}
            >
              تأكيد {confirm === 'delete' ? 'الحذف' : 'الإغلاق'}
            </button>
            <button className="button secondary" onClick={() => setConfirm('')}>
              تراجع
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
