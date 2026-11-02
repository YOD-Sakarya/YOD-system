import { useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { getAuthHeaders } from '../../lib/auth';
import { number } from '../../lib/format';
import { Modal } from '../ui/Modal';

/** Longest edge, in CSS pixels, a PDF page is rendered at; keeps big scans from exhausting phone memory. */
const MAX_PAGE_WIDTH = 1400;

/** Draws every page of a PDF into `container` as canvases that fit its width. pdf.js is loaded on first use only. */
async function renderPdf(data: ArrayBuffer, container: HTMLDivElement, onPage: (page: number, total: number) => void) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const pdf = await pdfjs.getDocument({ data }).promise;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const width = Math.min(container.clientWidth || 600, MAX_PAGE_WIDTH);
    const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * ratio });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${width}px`;
    canvas.setAttribute('aria-label', `صفحة ${number}`);
    container.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    onPage(number, pdf.numPages);
  }
}

/**
 * Shows a document inside the app. The browser's own PDF viewer is unreliable on phones (they save the file instead),
 * so PDFs are drawn with pdf.js; images and text are shown directly. Download stays available from here.
 */
export function DocumentViewer({
  docId,
  title,
  onDownload,
  onClose,
}: {
  docId: number;
  title: string;
  onDownload: () => void;
  onClose: () => void;
}) {
  const pages = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ kind: 'loading' | 'pdf' | 'image' | 'text'; progress?: string }>({
    kind: 'loading',
  });
  const [image, setImage] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    (async () => {
      const response = await fetch(`/api/documents/${docId}/view`, { headers: await getAuthHeaders() });
      if (!response.ok) throw new Error((await response.json()).message);
      const type = response.headers.get('content-type') || '';
      if (type.startsWith('image/')) {
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) {
          setImage(objectUrl);
          setState({ kind: 'image' });
        }
      } else if (type.startsWith('text/')) {
        const content = await response.text();
        if (active) {
          setText(content);
          setState({ kind: 'text' });
        }
      } else {
        const data = await response.arrayBuffer();
        if (!active) return;
        setState({ kind: 'pdf' });
        // Wait one frame so the page container exists and has its final width.
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (!active || !pages.current) return;
        await renderPdf(data, pages.current, (page, total) => {
          if (active) setState({ kind: 'pdf', progress: page < total ? `${number(page)} / ${number(total)}` : '' });
        });
      }
    })().catch(e => active && setError(e instanceof Error ? e.message : 'تعذر عرض الملف.'));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docId]);

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="modal-body viewer">
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {!error && (state.kind === 'loading' || state.progress) && (
          <p className="muted" role="status">
            <LoaderCircle className="spin" size={17} /> جارٍ تحميل الملف… {state.progress}
          </p>
        )}
        {image && <img className="viewer-image" src={image} alt={title} />}
        {state.kind === 'text' && <pre className="viewer-text">{text}</pre>}
        <div className="viewer-pages" ref={pages} />
        <div className="detail-actions">
          <button className="button secondary" onClick={onDownload}>
            <Download size={17} />
            تنزيل الملف
          </button>
        </div>
      </div>
    </Modal>
  );
}
