/** Union logo with the workspace name; `compact` is used in the sidebar. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'compact' : ''}`}>
      <img src="/union-logo.png" alt="شعار اتحاد الطلاب اليمنيين" />
      <div>
        <strong>مساحة الاتحاد</strong>
        <small>اتحاد الطلاب اليمنيين · سكاريا</small>
      </div>
    </div>
  );
}
