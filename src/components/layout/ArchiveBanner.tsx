import { Archive, ArrowLeft } from 'lucide-react';

/** Shown while browsing a finished cycle: its documents and votes can be read but not changed. */
export function ArchiveBanner({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <div className="preview-banner archive-banner">
      <Archive size={16} />
      <span>أنت تتصفح أرشيف عام {name} · للقراءة فقط</span>
      <button onClick={onBack}>
        العودة إلى العام الحالي <ArrowLeft size={14} />
      </button>
    </div>
  );
}
