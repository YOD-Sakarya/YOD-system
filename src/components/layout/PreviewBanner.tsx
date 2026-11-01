import { ArrowLeft, Eye } from 'lucide-react';

/** Shown in demo mode so nobody mistakes the sample data for their real account. */
export function PreviewBanner({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="preview-banner">
      <Eye size={16} />
      <span>معاينة التصميم · بيانات توضيحية، دون اتصال بحسابك</span>
      <button onClick={onLogin}>
        تسجيل الدخول <ArrowLeft size={14} />
      </button>
    </div>
  );
}
