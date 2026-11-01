import { LoaderCircle, RefreshCw } from 'lucide-react';
import { UsageBar } from '../../components/admin/UsageBar';
import { number } from '../../lib/format';
import type { StorageReport } from '../../types';

type Props = { report: StorageReport | null; error: string; loading: boolean; onRefresh: () => void };

/** Detailed storage usage: uploaded files (Cloudinary) and the database (Neon). */
export function StoragePanel({ report, error, loading, onRefresh }: Props) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>المساحة</h2>
          <p>تُحدَّث تلقائيًا كل ٥ دقائق. تنبيه عند ٧٥٪ وتحذير شديد عند ٩٠٪.</p>
        </div>
        <button className="button secondary" onClick={onRefresh} disabled={loading}>
          {loading ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}
          تحديث
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!report && !error && (
        <div className="table-loading" role="status">
          <LoaderCircle className="spin" size={24} />
          جارٍ قراءة المساحة…
        </div>
      )}
      {report && (
        <div className="usage-list">
          {report.files ? (
            <UsageBar
              title="الملفات (Cloudinary)"
              usage={report.files}
              detail={`${number(report.files.files)} ملف${report.files.plan ? ` · خطة ${report.files.plan}` : ''}`}
            />
          ) : (
            <p className="form-error">{report.errors.files}</p>
          )}
          {report.database ? (
            <UsageBar title="قاعدة البيانات (Neon)" usage={report.database} />
          ) : (
            <p className="form-error">{report.errors.database}</p>
          )}
        </div>
      )}
    </section>
  );
}
