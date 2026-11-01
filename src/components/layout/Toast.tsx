import { ShieldCheck, X } from 'lucide-react';

/** Transient confirmation message; the parent clears it automatically (see useToast). */
export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="toast" role="status">
      <ShieldCheck size={18} />
      {message}
      <button className="icon-button" onClick={onClose} aria-label="إغلاق التنبيه">
        <X size={15} />
      </button>
    </div>
  );
}
