/** Props common to every dialog; `preview` makes them read-only. */
export type DialogProps = { preview: boolean; onClose: () => void; onSaved: (message: string) => Promise<void> };
/** User-facing message for a caught error. */
export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'تعذر إكمال الطلب.');
export function PreviewNote() {
  return <p className="form-notice">هذه معاينة للقراءة فقط. سجّل الدخول لإضافة البيانات أو تعديلها.</p>;
}
