import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Accessible dialog built on the native <dialog>. While `busy`, Escape, the backdrop and the close
 * button are disabled so an in-flight request cannot be abandoned half way.
 */
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose),
    busyRef = useRef(busy),
    titleId = useId();
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const element = ref.current!;
    const previous = document.activeElement as HTMLElement;
    element.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      if (!busyRef.current) closeRef.current();
    };
    element.addEventListener('cancel', cancel);
    return () => {
      element.removeEventListener('cancel', cancel);
      element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      aria-labelledby={titleId}
      aria-busy={busy}
      onClick={e => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="إغلاق" disabled={busy} onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
