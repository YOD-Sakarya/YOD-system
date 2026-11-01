import { Archive, ArrowLeft } from 'lucide-react';

/** Shown while browsing a finished cycle: read-only for members; the developer may still change its documents. */
export function ArchiveBanner({ name, editable, onBack }: { name: string; editable: boolean; onBack: () => void }) {
  return (
    <div className="preview-banner archive-banner">
      <Archive size={16} />
      <span>
        أنت تتصفح أرشيف عام {name} · {editable ? 'يمكنك تعديل مستنداته بصفتك مطوّرًا' : 'للقراءة فقط'}
      </span>
      <button onClick={onBack}>
        العودة إلى العام الحالي <ArrowLeft size={14} />
      </button>
    </div>
  );
}
