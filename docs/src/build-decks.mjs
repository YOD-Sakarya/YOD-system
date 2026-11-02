// Builds the two Arabic PowerPoint decks (members deck without the developer role, and the full deck).
//   npm i --no-save pptxgenjs react-icons react react-dom sharp     (or set DECK_DEPS to a folder that has them)
//   node docs/src/build-decks.mjs
// Update the slide text here when the system's behaviour changes, then regenerate.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(process.env.DECK_DEPS || process.cwd(), 'noop.js'));
const pptxgen = require('pptxgenjs');
const sharp = require('sharp');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const lu = require('react-icons/lu');

const OUT = path.resolve(here, '..');
const LOGO = path.resolve(here, '../../public/union-logo.png');

// ---------- design tokens (same palette as the app) ----------
const C = {
  navy: '202B3B', red: 'A52C38', redDark: '7D1F29', canvas: 'F5F7FA', white: 'FFFFFF', ink: '2B3648',
  muted: '657387', line: 'E3E8EF', green: '23735C', amber: 'B7791F', blue: '3B6EA5', softNavy: '2D3B50',
};
const TONES = {
  red: { fg: C.red, bg: 'FBE9EB', border: 'F2C4C9' },
  green: { fg: C.green, bg: 'E3F3EC', border: 'BFE3D2' },
  amber: { fg: C.amber, bg: 'FFF3DC', border: 'F1D9A8' },
  blue: { fg: C.blue, bg: 'E6EEF7', border: 'CFDFF3' },
  navy: { fg: C.navy, bg: 'E7EAF0', border: 'CBD2DE' },
};
const FONT = 'Arial';
const W = 13.333;
const L = 0.6; // left margin
const R = W - 0.6; // right edge of content
const CW = R - L; // content width

// ---------- icons ----------
const iconCache = new Map();
async function icon(name, color, size = 256) {
  const key = `${name}:${color}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const Comp = lu[name];
  if (!Comp) throw new Error(`Unknown icon ${name}`);
  const svg = renderToStaticMarkup(React.createElement(Comp, { size, strokeWidth: 2 })).replaceAll('currentColor', `#${color}`);
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  const data = 'image/png;base64,' + png.toString('base64');
  iconCache.set(key, data);
  return data;
}

// ---------- a deck with RTL-aware building blocks ----------
class Deck {
  constructor(title, subject) {
    const p = (this.pres = new pptxgen());
    p.layout = 'LAYOUT_WIDE';
    p.rtlMode = true;
    p.title = title;
    p.subject = subject;
    p.author = 'اتحاد الطلاب اليمنيين في سكاريا';
    p.company = 'YOD Sakarya';
    p.lang = 'ar-SA';
    const base = { fontFace: FONT, rtlMode: true, lang: 'ar-SA', align: 'right', margin: 0 };
    p.defineSlideMaster({
      title: 'DARK',
      background: { color: C.navy },
      objects: [],
      slideNumber: { x: L, y: 7.02, w: 0.8, h: 0.3, fontFace: FONT, fontSize: 11, color: '8E9AAE' },
      // placeholders carry the position and look of titles, so slides only supply text
    });
    p.defineSlideMaster({
      title: 'LIGHT',
      background: { color: C.canvas },
      objects: [
        { text: { text: 'مساحة الاتحاد · اتحاد الطلاب اليمنيين في سكاريا', options: { ...base, x: 6.2, y: 7.02, w: R - 6.2, h: 0.3, fontSize: 11, color: C.muted } } },
        {
          placeholder: {
            options: { ...base, name: 'title', type: 'title', x: L, y: 0.4, w: CW, h: 1.0, fontSize: 34, bold: true, color: C.navy, valign: 'middle' },
            text: '',
          },
        },
      ],
      slideNumber: { x: L, y: 7.02, w: 0.8, h: 0.3, fontFace: FONT, fontSize: 11, color: C.muted },
    });
  }

  /** Plain RTL text box. */
  text(s, t, o) {
    s.addText(t, { fontFace: FONT, rtlMode: true, lang: 'ar-SA', align: 'right', valign: 'top', margin: 0, isTextBox: true, color: C.ink, fontSize: 16, ...o });
  }

  light(title, notes) {
    const s = this.pres.addSlide({ masterName: 'LIGHT' });
    s.addText(title, { placeholder: 'title' });
    if (notes) s.addNotes(notes);
    return s;
  }

  async circleIcon(s, { x, y, d, name, tone = 'red', solid = false }) {
    const t = TONES[tone];
    s.addShape(this.pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: solid ? t.fg : t.bg }, line: { type: 'none' } });
    s.addImage({ data: await icon(name, solid ? C.white : t.fg), x: x + d * 0.25, y: y + d * 0.25, w: d * 0.5, h: d * 0.5, altText: '' });
  }

  shadow() {
    return { type: 'outer', color: '000000', blur: 6, offset: 1.5, angle: 90, opacity: 0.1 };
  }

  panel(s, { x, y, w, h, fill = C.white, line = C.line, radius = 0.12, shadow = true }) {
    s.addShape(this.pres.shapes.ROUNDED_RECTANGLE, {
      x, y, w, h, rectRadius: radius, fill: { color: fill }, line: { color: line, width: 0.75 }, ...(shadow ? { shadow: this.shadow() } : {}),
    });
  }

  /** White card: icon top-right, bold title, body text. */
  async card(s, { x, y, w, h, name, tone = 'red', title, body, titleSize = 20, bodySize = 15, d = 0.8, fill }) {
    this.panel(s, { x, y, w, h, ...(fill ? { fill, line: fill } : {}) });
    await this.circleIcon(s, { x: x + w - 0.3 - d, y: y + 0.3, d, name, tone });
    const dark = fill === C.navy;
    this.text(s, title, { x: x + 0.3, y: y + 0.3 + d + 0.2, w: w - 0.6, h: 0.5, fontSize: titleSize, bold: true, color: dark ? C.white : C.navy });
    if (body) this.text(s, body, { x: x + 0.3, y: y + 0.3 + d + 0.78, w: w - 0.6, h: h - (0.3 + d + 0.78) - 0.2, fontSize: bodySize, color: dark ? 'D6DBE5' : C.muted, paraSpaceAfter: 4 });
  }

  /** Steps laid out right to left with chevrons between them. */
  async flow(s, { y, h, steps }) {
    const gap = 0.55;
    const n = steps.length;
    const sw = (CW - (n - 1) * gap) / n;
    const chevron = await icon('LuChevronLeft', C.red);
    for (let i = 0; i < n; i++) {
      const st = steps[i];
      const x = R - (i + 1) * sw - i * gap;
      const dark = st.tone === 'dark';
      const fill = dark ? C.navy : st.tone === 'good' ? TONES.green.bg : st.tone === 'bad' ? TONES.red.bg : C.white;
      const border = dark ? C.navy : st.tone === 'good' ? TONES.green.border : st.tone === 'bad' ? TONES.red.border : C.line;
      this.panel(s, { x, y, w: sw, h, fill, line: border });
      this.text(s, st.title, { x: x + 0.15, y: y + 0.2, w: sw - 0.3, h: 0.7, fontSize: 17, bold: true, align: 'center', color: dark ? C.white : C.navy, valign: 'middle' });
      if (st.body) this.text(s, st.body, { x: x + 0.15, y: y + 0.95, w: sw - 0.3, h: h - 1.1, fontSize: 14, align: 'center', color: dark ? 'D6DBE5' : C.muted });
      if (i < n - 1) s.addImage({ data: chevron, x: x - gap + (gap - 0.34) / 2, y: y + h / 2 - 0.17, w: 0.34, h: 0.34, altText: '' });
    }
  }

  /** Tinted note with an icon. */
  async callout(s, { x, y, w, h, tone = 'blue', name = 'LuInfo', text }) {
    const t = TONES[tone];
    s.addShape(this.pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: t.bg }, line: { color: t.border, width: 0.75 } });
    s.addImage({ data: await icon(name, t.fg), x: x + w - 0.3 - 0.4, y: y + h / 2 - 0.2, w: 0.4, h: 0.4, altText: '' });
    this.text(s, text, { x: x + 0.3, y: y + 0.1, w: w - 1.2, h: h - 0.2, fontSize: 15, valign: 'middle', color: C.ink });
  }

  /** Bulleted list; items are strings or {b: bold lead, t: text}.
   *  Paragraph settings (direction, alignment, bullet) go on the FIRST run of each paragraph only: repeating them on
   *  later runs makes the library emit a second paragraph-properties block that drops the right-to-left direction. */
  bullets(s, items, { x, y, w, h, size = 16, space = 9, color = C.ink }) {
    const para = { align: 'right', rtlMode: true, bullet: { indent: 18 }, paraSpaceAfter: space };
    const runs = [];
    items.forEach((it, i) => {
      const last = i === items.length - 1;
      if (typeof it === 'string') runs.push({ text: it, options: { ...para, breakLine: !last } });
      else {
        runs.push({ text: it.b + ' ', options: { ...para, bold: true, color: C.navy } });
        runs.push({ text: it.t, options: { breakLine: !last } });
      }
    });
    s.addText(runs, { fontFace: FONT, lang: 'ar-SA', valign: 'top', margin: 0, isTextBox: true, color, fontSize: size, x, y, w, h });
  }

  /** RTL table: logical first column ends up on the right. */
  table(s, { x, y, w, colW, header, rows, fontSize = 14, rowH = 0.55 }) {
    const rev = a => [...a].reverse();
    const cell = (t, o = {}) => ({ text: t, options: { fontFace: FONT, fontSize, rtlMode: true, lang: 'ar-SA', align: 'right', valign: 'middle', margin: [4, 10, 4, 10], color: C.ink, ...o } });
    const head = rev(header).map(t => cell(t, { bold: true, color: C.white, fill: { color: C.navy } }));
    const body = rows.map((r, i) =>
      rev(r).map((t, j, arr) => cell(t, { fill: { color: i % 2 ? C.canvas : C.white }, bold: j === arr.length - 1, color: j === arr.length - 1 ? C.navy : C.ink })),
    );
    s.addTable([head, ...body], { x, y, w, colW: rev(colW), rowH, border: { type: 'solid', pt: 0.75, color: C.line } });
  }

  async titleSlide({ title, subtitle, tag }) {
    const s = this.pres.addSlide({ masterName: 'DARK' });
    s.addShape(this.pres.shapes.OVAL, { x: -2.2, y: 3.6, w: 7, h: 7, fill: { type: 'none' }, line: { color: C.softNavy, width: 34 } });
    s.addShape(this.pres.shapes.ROUNDED_RECTANGLE, { x: R - 1.5, y: 0.6, w: 1.5, h: 1.5, rectRadius: 0.2, fill: { color: C.white }, line: { type: 'none' } });
    s.addImage({ path: LOGO, x: R - 1.35, y: 0.75, w: 1.2, h: 1.2, altText: 'شعار الاتحاد' });
    this.text(s, title, { x: L + 1, y: 2.5, w: CW - 1, h: 1.7, fontSize: 56, bold: true, color: C.white, valign: 'middle' });
    this.text(s, subtitle, { x: L + 1, y: 4.3, w: CW - 1, h: 0.9, fontSize: 26, color: 'D6DBE5' });
    s.addShape(this.pres.shapes.ROUNDED_RECTANGLE, { x: R - 4.6, y: 5.6, w: 4.6, h: 0.6, rectRadius: 0.3, fill: { color: C.red }, line: { type: 'none' } });
    this.text(s, tag, { x: R - 4.6, y: 5.6, w: 4.6, h: 0.6, fontSize: 16, align: 'center', valign: 'middle', color: C.white, bold: true });
    return s;
  }

  async closingSlide({ title, line, note }) {
    const s = this.pres.addSlide({ masterName: 'DARK' });
    s.addShape(this.pres.shapes.OVAL, { x: -2.2, y: -3.2, w: 7, h: 7, fill: { type: 'none' }, line: { color: C.softNavy, width: 34 } });
    await this.circleIcon(s, { x: R - 1.2, y: 1.7, d: 1.2, name: 'LuRocket', tone: 'red', solid: true });
    this.text(s, title, { x: L + 1, y: 3.1, w: CW - 1, h: 1.1, fontSize: 48, bold: true, color: C.white, valign: 'middle' });
    this.text(s, line, { x: L + 1, y: 4.35, w: CW - 1, h: 0.9, fontSize: 24, color: 'D6DBE5' });
    if (note) this.text(s, note, { x: L + 1, y: 5.5, w: CW - 1, h: 0.6, fontSize: 16, color: '8E9AAE' });
  }

  async write(file) {
    await this.pres.writeFile({ fileName: path.join(OUT, file) });
    console.log('wrote', file);
  }
}

// ---------- shared slides ----------
const tile3 = (i, n = 3, gap = 0.35) => {
  const w = (CW - (n - 1) * gap) / n;
  return { w, x: R - (i + 1) * w - i * gap };
};

async function whatIs(d, { dev }) {
  const s = d.light('ما هي «مساحة الاتحاد»؟', 'موقع واحد يجمع عمل الاتحاد: المستندات والمراجعات والتصويت.');
  d.text(s, 'كل عمل الاتحاد في مكان واحد: مرتّب، وواضح، ويحفظ تاريخنا عامًا بعد عام.', { x: L, y: 1.6, w: CW, h: 0.8, fontSize: 22, color: C.ink });
  const cards = [
    ['LuFiles', 'red', 'المستندات', 'نرفع التقارير والخطط والمحاضر والتصورات ونجدها بسهولة حسب اللجنة والنوع والعام.'],
    ['LuClipboardCheck', 'green', 'المراجعات', 'لا يُنفَّذ تصوّر قبل موافقة أصحاب الشأن، ويُعتمد ما ترفعه لجنة الرقابة بقبول أعضائها.'],
    ['LuVote', 'blue', 'التصويت', 'نقرّر معًا: صوت لكل عضو، والنتيجة تُسجَّل تلقائيًا عند الإغلاق.'],
  ];
  for (let i = 0; i < 3; i++) {
    const { x, w } = tile3(i);
    await d.card(s, { x, y: 2.5, w, h: 3.3, name: cards[i][0], tone: cards[i][1], title: cards[i][2], body: cards[i][3] });
  }
  await d.callout(s, {
    x: L, y: 6.0, w: CW, h: 0.75, tone: 'amber', name: 'LuArchive',
    text: dev ? 'الأعضاء يتغيّرون كل عام: يسلّم المطوّر المقعد لشخص جديد، وتبقى مستندات الأعوام السابقة محفوظة في الأرشيف.' : 'الأعضاء يتغيّرون كل عام، وتبقى مستندات الأعوام السابقة محفوظة في الأرشيف لمن يأتي بعدهم.',
  });
}

async function reviewFlow(d) {
  const s = d.light('مسار مراجعة التصوّرات');
  await d.flow(s, {
    y: 1.7, h: 2.2,
    steps: [
      { title: 'رفع تصوّر', body: 'من أي لجنة أو من القيادة' },
      { title: 'قيد المراجعة', body: 'ينتظر ثلاثة مراجعين', tone: 'dark' },
      { title: 'الرئيس · الأمين العام · المسؤول المالي', body: 'كلٌّ يقرّر: مقبول أو مرفوض' },
      { title: 'مقبول', body: 'إن قبلوا جميعًا', tone: 'good' },
    ],
  });
  await d.card(s, { x: tile3(0, 2).x, y: 4.2, w: tile3(0, 2).w, h: 2.5, name: 'LuEye', tone: 'blue', title: 'كيف أعرف من راجع؟', body: 'ثلاث نقاط صغيرة بجانب التصوّر: تمتلئ نقطة مع كل مراجعة.' });
  await d.card(s, { x: tile3(1, 2).x, y: 4.2, w: tile3(1, 2).w, h: 2.5, name: 'LuRepeat', tone: 'amber', title: 'ماذا لو عدّلت التصوّر؟', body: 'تُمسح المراجعات السابقة وتبدأ الدورة من جديد، لأن الإصدار تغيّر. ورفض أي مراجع يجعل الحالة «مرفوض».' });
}

async function oversight(d) {
  const s = d.light('مستندات لجنة الرقابة');
  await d.flow(s, {
    y: 1.7, h: 2.2,
    steps: [
      { title: 'عضو رقابة يرفع تقريرًا', body: 'لا يراه غيرهم' },
      { title: 'قيد المراجعة', body: 'ينتظر العضوين الآخرين', tone: 'dark' },
      { title: 'العضوان الآخران', body: 'يقبل كلٌّ منهما أو يرفض' },
      { title: 'مقبول', body: 'يراه الجميع', tone: 'good' },
    ],
  });
  d.bullets(s, [
    { b: 'ثلاثة أعضاء:', t: 'رئيس اللجنة ونائبه والمقرّر. موافقة صاحب التقرير تُحسب تلقائيًا.' },
    { b: 'قبل القبول:', t: 'يراه أعضاء اللجنة فقط؛ لا يظهر لغيرهم في القوائم ولا في البحث.' },
    { b: 'إن رُفض:', t: 'يبقى خاصًا ويستطيع صاحبه تعديله وإعادة تقديمه.' },
    { b: 'ما ترفعه الرقابة:', t: 'التقارير فقط.' },
  ], { x: L, y: 4.25, w: CW, h: 2.6, size: 19, space: 10 });
}

async function votes(d) {
  const s = d.light('التصويت');
  await d.flow(s, {
    y: 1.7, h: 2.0,
    steps: [
      { title: 'فتح الجلسة', body: 'الرئيس أو الأمين العام' },
      { title: 'الجميع يصوّتون', body: 'صوت واحد لكل شخص' },
      { title: 'الإغلاق', body: 'يدويًا أو عند الموعد', tone: 'dark' },
      { title: 'القرار', body: 'يُسجَّل تلقائيًا', tone: 'good' },
    ],
  });
  const stats = [
    ['٢ – ١٠', 'خيارات مختلفة في الجلسة الواحدة'],
    ['١', 'صوت لكل عضو، يمكن تغييره قبل الإغلاق'],
    ['٣', 'نتائج ممكنة: خيار فائز · تعادل · لا قرار'],
  ];
  for (let i = 0; i < 3; i++) {
    const { x, w } = tile3(i);
    d.panel(s, { x, y: 4.05, w, h: 2.6 });
    d.text(s, stats[i][0], { x: x + 0.3, y: 4.3, w: w - 0.6, h: 1.1, fontSize: 52, bold: true, color: C.red, valign: 'middle' });
    d.text(s, stats[i][1], { x: x + 0.3, y: 5.5, w: w - 0.6, h: 1.0, fontSize: 16, color: C.muted });
  }
}

async function cycles(d, { dev }) {
  const s = d.light('الأعوام والأرشيف');
  const w2 = tile3(0, 2).w;
  await d.card(s, { x: tile3(0, 2).x, y: 1.65, w: w2, h: 2.6, name: 'LuCircleDot', tone: 'green', title: 'العام الحالي', body: 'تُرفع فيه المستندات الجديدة وتُفتح فيه جلسات التصويت وتجري المراجعات.' });
  await d.card(s, { x: tile3(1, 2).x, y: 1.65, w: w2, h: 2.6, name: 'LuArchive', tone: 'amber', title: 'الأعوام السابقة (أرشيف)', body: dev ? 'تبقى ظاهرة للجميع للقراءة والبحث والتنزيل. لا يُضاف إليها ولا يُعدَّل فيها، إلا من المطوّر.' : 'تبقى ظاهرة للجميع للقراءة والبحث والتنزيل، لكن لا يُضاف إليها ولا يُعدَّل فيها.' });
  d.text(s, 'كيف أتصفح عامًا سابقًا؟', { x: L, y: 4.5, w: CW, h: 0.5, fontSize: 20, bold: true, color: C.navy });
  const steps = ['من أعلى الصفحة اختر العام من القائمة بجانب البحث.', 'يظهر شريط أصفر يخبرك أنك في الأرشيف وتختفي أزرار الإضافة.', 'للعودة اضغط «العودة إلى العام الحالي».'];
  for (let i = 0; i < 3; i++) {
    const { x, w } = tile3(i);
    d.panel(s, { x, y: 5.1, w, h: 1.55 });
    d.text(s, ['١', '٢', '٣'][i], { x: x + w - 0.85, y: 5.25, w: 0.55, h: 0.55, fontSize: 24, bold: true, color: C.red });
    d.text(s, steps[i], { x: x + 0.25, y: 5.8, w: w - 0.5, h: 0.8, fontSize: 14, color: C.ink });
  }
}

async function search(d) {
  const s = d.light('البحث السريع');
  // mock search bar
  d.panel(s, { x: L, y: 1.65, w: CW, h: 0.85, radius: 0.2 });
  s.addImage({ data: await icon('LuSearch', C.muted), x: R - 0.75, y: 1.9, w: 0.36, h: 0.36, altText: '' });
  d.text(s, 'ابحث في المستندات والتصويت واللجان…', { x: L + 1.2, y: 1.65, w: CW - 2.3, h: 0.85, fontSize: 18, color: C.muted, valign: 'middle' });
  d.text(s, '/', { x: L + 0.3, y: 1.8, w: 0.55, h: 0.55, fontSize: 18, align: 'center', valign: 'middle', color: C.muted, bold: true });
  // results mock
  const rx = 5.9;
  d.panel(s, { x: rx, y: 2.8, w: R - rx, h: 3.9 });
  const rows = [
    ['LuFiles', 'red', 'تقرير الأنشطة الثقافية', 'تقرير · مسؤول أنشطة', '٢٠٢٥/٢٠٢٦'],
    ['LuUpload', 'green', 'إضافة مستند جديد', 'رفع ملف إلى مكتبة المستندات', ''],
    ['LuKeyRound', 'blue', 'تغيير كلمة المرور', 'حسابي', ''],
    ['LuVote', 'amber', 'اعتماد خطة الأنشطة', 'القرار: موافق', ''],
  ];
  for (let i = 0; i < rows.length; i++) {
    const y = 2.95 + i * 0.93;
    await d.circleIcon(s, { x: R - 0.25 - 0.62, y: y + 0.08, d: 0.62, name: rows[i][0], tone: rows[i][1] });
    d.text(s, rows[i][2], { x: rx + 1.6, y: y + 0.04, w: R - rx - 2.65, h: 0.4, fontSize: 17, bold: true, color: C.navy });
    d.text(s, rows[i][3], { x: rx + 1.6, y: y + 0.45, w: R - rx - 2.65, h: 0.35, fontSize: 14, color: C.muted });
    if (rows[i][4]) {
      s.addShape(d.pres.shapes.ROUNDED_RECTANGLE, { x: rx + 0.3, y: y + 0.2, w: 1.15, h: 0.36, rectRadius: 0.18, fill: { color: TONES.amber.bg }, line: { color: TONES.amber.border, width: 0.75 } });
      d.text(s, rows[i][4], { x: rx + 0.3, y: y + 0.2, w: 1.15, h: 0.36, fontSize: 12, align: 'center', valign: 'middle', color: '7A4B00' });
    }
  }
  d.bullets(s, [
    { b: 'يجد أي مستند', t: 'من كل الأعوام، بجزء من عنوانه أو لجنته أو صاحبه.' },
    { b: 'ينفّذ الإجراءات:', t: 'اكتب «رفع ملف» أو «كلمة السر» أو «خروج».' },
    { b: 'يتجاوز اختلاف الكتابة:', t: '«اداره» تجد «إدارة».' },
    { b: 'الأسهم و Enter و Esc', t: 'للتنقل والفتح والإغلاق.' },
  ], { x: L, y: 2.85, w: 5.0, h: 3.3, size: 15, space: 8 });
  for (const [i, k] of ['Ctrl + K', '/'].entries()) {
    const x = L + i * 1.65;
    s.addShape(d.pres.shapes.ROUNDED_RECTANGLE, { x, y: 6.25, w: 1.45, h: 0.5, rectRadius: 0.08, fill: { color: C.white }, line: { color: 'CDD5E0', width: 1 } });
    d.text(s, k, { x, y: 6.25, w: 1.45, h: 0.5, fontSize: 16, bold: true, align: 'center', valign: 'middle', color: C.navy, rtlMode: false, align: 'center' });
  }
}

async function account(d) {
  const s = d.light('حسابي وأمانك');
  const cards = [
    ['LuKeyRound', 'red', 'كلمة المرور', 'غيّرها من «حسابي»: ١٠ أحرف على الأقل. بعد التغيير تنتهي جلساتك على الأجهزة الأخرى.'],
    ['LuMail', 'blue', 'البريد الإلكتروني', 'يمكنك الدخول به أو باسم المستخدم. يلزم إدخال كلمة المرور الحالية لتغييره.'],
    ['LuShieldCheck', 'green', 'جلستك', 'تبقى مفتوحة يومًا كاملًا. سجّل الخروج بعد استعمال جهاز مشترك.'],
  ];
  for (let i = 0; i < 3; i++) {
    const { x, w } = tile3(i);
    await d.card(s, { x, y: 1.65, w, h: 3.5, name: cards[i][0], tone: cards[i][1], title: cards[i][2], body: cards[i][3] });
  }
  await d.callout(s, { x: L, y: 5.45, w: CW, h: 1.2, tone: 'amber', name: 'LuTriangleAlert', text: 'لا تشارك كلمة مرورك مع أحد، ولا تحفظها على أجهزة عامة. إن شككت في حسابك فغيّر كلمة المرور فورًا.' });
}

// ---------- deck 1: members (no developer role) ----------
async function buildUsers() {
  const d = new Deck('مساحة الاتحاد: دليل الاستخدام للأعضاء', 'دليل استخدام النظام للأعضاء');
  await d.titleSlide({ title: 'مساحة الاتحاد', subtitle: 'دليل الاستخدام للأعضاء', tag: 'اتحاد الطلاب اليمنيين في سكاريا' });
  await whatIs(d, { dev: false });

  // login
  let s = d.light('تسجيل الدخول وحسابي');
  const steps = [
    ['افتح الموقع', 'yodsakarya-system.vercel.app من الحاسوب أو الهاتف.'],
    ['سجّل دخولك', 'اكتب اسم المستخدم أو بريدك الإلكتروني، ثم كلمة المرور.'],
    ['ابدأ العمل', 'تبقى جلستك مفتوحة يومًا كاملًا.'],
  ];
  for (let i = 0; i < 3; i++) {
    const y = 1.65 + i * 1.5;
    d.panel(s, { x: 6.6, y, w: R - 6.6, h: 1.3 });
    s.addShape(d.pres.shapes.OVAL, { x: R - 0.3 - 0.8, y: y + 0.25, w: 0.8, h: 0.8, fill: { color: i === 2 ? C.red : TONES.red.bg }, line: { type: 'none' } });
    d.text(s, ['١', '٢', '٣'][i], { x: R - 0.3 - 0.8, y: y + 0.25, w: 0.8, h: 0.8, fontSize: 26, bold: true, align: 'center', valign: 'middle', color: i === 2 ? C.white : C.red });
    d.text(s, steps[i][0], { x: 6.9, y: y + 0.2, w: R - 6.6 - 1.55, h: 0.45, fontSize: 19, bold: true, color: C.navy });
    d.text(s, steps[i][1], { x: 6.9, y: y + 0.68, w: R - 6.6 - 1.55, h: 0.55, fontSize: 14, color: C.muted, rtlMode: true });
  }
  await d.card(s, { x: L, y: 1.65, w: 5.6, h: 2.7, name: 'LuUserCog', tone: 'blue', title: 'صفحة «حسابي»', body: 'اضغط على اسمك أسفل القائمة الجانبية لتغيير بريدك وكلمة مرورك.' });
  await d.callout(s, { x: L, y: 4.6, w: 5.6, h: 1.85, tone: 'amber', name: 'LuCircleAlert', text: 'لا يوجد إنشاء حساب ذاتي. تضيف إدارة النظام الحسابات؛ إن لم يكن لديك حساب فتواصل معها.' });

  // screens
  s = d.light('جولة في الشاشات');
  const tiles = [
    ['LuLayoutDashboard', 'red', 'نظرة عامة', 'أرقام سريعة وآخر المستندات وما على جدول الاتحاد.'],
    ['LuFiles', 'blue', 'المستندات', 'المكتبة كاملة مع تصفية وبحث وتنزيل.'],
    ['LuClipboardCheck', 'green', 'المراجعات', 'ما ينتظر الموافقة، وعدّاد بعدده في القائمة.'],
    ['LuVote', 'amber', 'جلسات التصويت', 'الجلسات المفتوحة والمنتهية ونتائجها.'],
    ['LuCalendarDays', 'red', 'تقويم الاتحاد', 'مواعيد الفعاليات شهرًا بشهر.'],
    ['LuUsers', 'blue', 'اللجان والصلاحيات', 'كل لجنة وما يحق لها رفعه من أنواع المستندات.'],
  ];
  for (let i = 0; i < 6; i++) {
    const row = Math.floor(i / 3);
    const { x, w } = tile3(i % 3);
    await d.card(s, { x, y: 1.6 + row * 2.7, w, h: 2.5, name: tiles[i][0], tone: tiles[i][1], title: tiles[i][2], body: tiles[i][3], d: 0.7, titleSize: 19, bodySize: 14 });
  }

  // roles
  s = d.light('الأدوار: من هو في أي مجموعة؟');
  const groups = [
    ['LuLandmark', 'red', 'القيادة', ['رئيس الهيئة التنفيذية', 'نائب الرئيس', 'أمين عام', 'مسؤول مالي'], 'الرئيس والأمين العام والمسؤول المالي يراجعون التصوّرات، والرئيس والأمين العام يفتحون التصويت.'],
    ['LuUsers', 'blue', 'اللجان', ['علاقات', 'أكاديمي', 'أنشطة', 'طالبات', 'إعلامي'], 'يرفعون التصوّرات والتقارير والخطط ويصوّتون.'],
    ['LuShieldCheck', 'amber', 'لجنة الرقابة', ['رئيس اللجنة', 'نائب الرئيس', 'المقرّر'], 'يطّلعون على المستندات ويرفعون التقارير فقط ويراجعون تقارير بعضهم.'],
  ];
  for (let i = 0; i < 3; i++) {
    const { x, w } = tile3(i);
    d.panel(s, { x, y: 1.6, w, h: 5.1 });
    await d.circleIcon(s, { x: x + w - 0.3 - 0.7, y: 1.85, d: 0.7, name: groups[i][0], tone: groups[i][1] });
    d.text(s, groups[i][2], { x: x + 0.3, y: 1.9, w: w - 1.2, h: 0.6, fontSize: 24, bold: true, color: C.navy, valign: 'middle' });
    d.bullets(s, groups[i][3], { x: x + 0.3, y: 2.8, w: w - 0.6, h: 1.9, size: 16, space: 5 });
    d.text(s, groups[i][4], { x: x + 0.3, y: 4.85, w: w - 0.6, h: 1.7, fontSize: 14, color: C.muted });
  }

  // upload
  s = d.light('رفع مستند جديد');
  await d.flow(s, {
    y: 1.65, h: 1.9,
    steps: [
      { title: '«إضافة مستند»', body: 'من أعلى المكتبة' },
      { title: 'العنوان والنوع والربع', body: 'اكتبها واختر' },
      { title: 'تاريخ الفعالية', body: 'يظهر في التقويم' },
      { title: 'اختر الملف', body: 'من جهازك' },
      { title: 'إضافة المستند', body: 'يُحفظ باسمك', tone: 'dark' },
    ],
  });
  d.bullets(s, [
    { b: 'يُحفظ في العام الحالي', t: 'باسمك، والتصوّر يبدأ بحالة «قيد المراجعة» تلقائيًا.' },
    { b: 'التعديل:', t: 'لصاحب المستند ولمن يراجع التصوّرات، وفي العام الحالي فقط.' },
  ], { x: L, y: 3.85, w: CW, h: 1.5, size: 17 });
  await d.callout(s, { x: L, y: 5.5, w: CW, h: 1.2, tone: 'amber', name: 'LuTriangleAlert', text: 'حجم الملف: يرفض الموقع حاليًا ما يزيد عن ٤٫٥ ميجابايت تقريبًا. اضغط الملفات الكبيرة قبل الرفع.' });

  // who uploads what
  s = d.light('من يرفع أي نوع من المستندات؟');
  d.table(s, {
    x: L, y: 1.7, w: CW, colW: [3.4, CW - 3.4], rowH: 0.64, fontSize: 16,
    header: ['نوع المستند', 'من يرفعه؟'],
    rows: [
      ['تصوّر (مقترح فعالية أو مشروع)', 'الرئيس · نائب الرئيس · الأمين العام · المسؤول المالي · اللجان الخمس'],
      ['تقرير', 'جميع الأدوار تقريبًا (القيادة واللجان ولجنة الرقابة)'],
      ['بيان', 'الرئيس · الأمين العام'],
      ['محضر اجتماع', 'الأمين العام'],
      ['خطة', 'اللجان الخمس'],
    ],
  });
  await d.callout(s, { x: L, y: 6.0, w: CW, h: 0.75, tone: 'blue', text: 'إن لم يظهر لك زر «إضافة مستند» أو النوع الذي تريده، فدورك غير مسموح له به.' });

  await reviewFlow(d);
  await oversight(d);
  await votes(d);
  await cycles(d, { dev: false });
  await search(d);
  await account(d);

  // deleting
  s = d.light('حذف مستند رفعته');
  const w2 = tile3(0, 2).w;
  d.panel(s, { x: tile3(0, 2).x, y: 1.65, w: w2, h: 4.1, fill: 'F1F9F5', line: TONES.green.border });
  await d.circleIcon(s, { x: tile3(0, 2).x + w2 - 1.0, y: 1.9, d: 0.7, name: 'LuCheck', tone: 'green', solid: true });
  d.text(s, 'تستطيع الحذف', { x: tile3(0, 2).x + 0.3, y: 1.95, w: w2 - 1.5, h: 0.6, fontSize: 24, bold: true, color: C.green, valign: 'middle' });
  d.bullets(s, ['ما دام المستند غير مقبول: قيد المراجعة أو مرفوض أو مكتمل', 'وكان في العام الحالي'], { x: tile3(0, 2).x + 0.3, y: 2.9, w: w2 - 0.6, h: 3, size: 17 });
  d.panel(s, { x: tile3(1, 2).x, y: 1.65, w: w2, h: 4.1, fill: 'FDF2F3', line: TONES.red.border });
  await d.circleIcon(s, { x: tile3(1, 2).x + w2 - 1.0, y: 1.9, d: 0.7, name: 'LuLock', tone: 'red', solid: true });
  d.text(s, 'لا تستطيع الحذف', { x: tile3(1, 2).x + 0.3, y: 1.95, w: w2 - 1.5, h: 0.6, fontSize: 24, bold: true, color: C.red, valign: 'middle' });
  d.bullets(s, ['بعد أن يقبله المراجعون', 'أو بعد انتهاء العام وانتقاله إلى الأرشيف', 'في هذه الحالة تواصل مع إدارة النظام'], { x: tile3(1, 2).x + 0.3, y: 2.9, w: w2 - 0.6, h: 3, size: 17 });
  await d.callout(s, { x: L, y: 6.0, w: CW, h: 0.75, tone: 'blue', text: 'حذف المستند يحذف مراجعاته أيضًا، ولا يمكن التراجع عنه من النظام.' });

  await d.closingSlide({ title: 'جاهزون للبدء؟', line: 'ادخل إلى «مساحة الاتحاد» وابدأ بمستنداتك ومراجعاتك وأصواتك.', note: 'للمساعدة: تواصل مع إدارة النظام' });
  await d.write('YOD-presentation-users-ar.pptx');
}

// ---------- deck 2: everything, including the developer ----------
async function buildFull() {
  const d = new Deck('مساحة الاتحاد: العرض الشامل للنظام', 'شرح النظام والأدوار ودور المطوّر والبنية التقنية');
  await d.titleSlide({ title: 'مساحة الاتحاد', subtitle: 'العرض الشامل: النظام والأدوار ودور المطوّر والتشغيل', tag: 'اتحاد الطلاب اليمنيين في سكاريا' });
  await whatIs(d, { dev: true });

  let s = d.light('الأدوار الثلاثة عشر');
  const grp = [
    ['LuLandmark', 'red', 'القيادة', ['رئيس الهيئة التنفيذية', 'نائب الرئيس', 'أمين عام', 'مسؤول مالي']],
    ['LuUsers', 'blue', 'اللجان', ['علاقات', 'أكاديمي', 'أنشطة', 'طالبات', 'إعلامي']],
    ['LuShieldCheck', 'amber', 'لجنة الرقابة', ['رئيس اللجنة', 'نائب رئيس اللجنة', 'المقرّر']],
    ['LuCode', 'navy', 'المطوّر', ['مسؤول النظام التقني', 'يدير الحسابات والأعوام والمساحة والحذف']],
  ];
  for (let i = 0; i < 4; i++) {
    const { x, w } = tile3(i, 4, 0.3);
    const dark = i === 3;
    d.panel(s, { x, y: 1.6, w, h: 5.1, ...(dark ? { fill: C.navy, line: C.navy } : {}) });
    await d.circleIcon(s, { x: x + w - 0.25 - 0.65, y: 1.85, d: 0.65, name: grp[i][0], tone: grp[i][1], solid: dark });
    d.text(s, grp[i][2], { x: x + 0.25, y: 1.9, w: w - 1.1, h: 0.55, fontSize: 22, bold: true, color: dark ? C.white : C.navy, valign: 'middle' });
    d.bullets(s, grp[i][3], { x: x + 0.25, y: 2.85, w: w - 0.5, h: 3.7, size: 16, space: 6, color: dark ? 'E6EAF2' : C.ink });
  }

  s = d.light('ماذا يستطيع كل دور؟');
  d.table(s, {
    x: L, y: 1.6, w: CW, colW: [1.9, 2.7, 1.9, 1.6, 2.4, CW - 10.5], rowH: 0.5, fontSize: 13,
    header: ['الدور', 'يرفع', 'يراجع', 'يفتح تصويتًا', 'يحذف مستندًا', 'يدير النظام'],
    rows: [
      ['الرئيس', 'تصوّر · تقرير · بيان', 'التصوّرات', 'نعم', 'مستنداته قبل القبول', '—'],
      ['نائب الرئيس', 'تصوّر · تقرير', '—', '—', 'مستنداته قبل القبول', '—'],
      ['الأمين العام', 'تصوّر · تقرير · بيان · محضر', 'التصوّرات', 'نعم', 'مستنداته قبل القبول', '—'],
      ['المسؤول المالي', 'تصوّر · تقرير', 'التصوّرات', '—', 'مستنداته قبل القبول', '—'],
      ['اللجان الخمس', 'تصوّر · تقرير · خطة', '—', '—', 'مستنداتها قبل القبول', '—'],
      ['لجنة الرقابة', 'تقرير فقط', 'تقارير بعضهم', '—', 'مستنداتهم قبل القبول', '—'],
      ['المطوّر', 'كل الأنواع', 'لا', 'نعم', 'أي شيء', 'نعم'],
    ],
  });
  await d.callout(s, { x: L, y: 6.3, w: CW, h: 0.55, tone: 'blue', text: 'الجميع يصوّتون ويبحثون ويتصفحون الأرشيف. الصلاحيات تُفحص في الخادم دائمًا.' });

  s = d.light('دورة حياة المستند');
  await d.flow(s, {
    y: 1.7, h: 2.3,
    steps: [
      { title: 'رفع', body: 'يُحفظ في العام الحالي باسم صاحبه' },
      { title: 'مراجعة', body: 'إن كان تصوّرًا أو من لجنة الرقابة', tone: 'dark' },
      { title: 'اعتماد', body: 'مقبول أو مرفوض', tone: 'good' },
      { title: 'أرشفة', body: 'يُقفل عند بدء عام جديد' },
      { title: 'حذف', body: 'لصاحبه قبل القبول، وللمطوّر دائمًا', tone: 'bad' },
    ],
  });
  d.bullets(s, [
    { b: 'التعديل يعيد المراجعة:', t: 'أي تعديل يمسح المراجعات السابقة ويعيد الحالة إلى «قيد المراجعة».' },
    { b: 'التخزين:', t: 'الملف في Cloudinary، وسجلّه (العنوان والحالة والعام) في قاعدة البيانات.' },
    { b: 'مستندات لجنة الرقابة:', t: 'مخفية عن غير أعضائها والمطوّر حتى القبول.' },
  ], { x: L, y: 4.35, w: CW, h: 2.4, size: 17 });

  await reviewFlow(d);
  await oversight(d);
  await votes(d);
  await cycles(d, { dev: true });
  await search(d);
  await account(d);

  // ---- developer section ----
  s = d.light('دور المطوّر: ماذا يملك؟');
  const caps = [
    ['LuUsers', 'red', 'المستخدمون', 'يضيف الحسابات ويعدّلها ويغيّر الأدوار ويسلّم المقعد لشخص جديد.'],
    ['LuCalendarDays', 'blue', 'الأعوام', 'يبدأ عامًا جديدًا ويؤرشف السابق، ويحذف عامًا بتأكيد كتابي.'],
    ['LuTrash2', 'amber', 'الحذف', 'وحده يحذف مستندًا بعد قبوله أو من الأرشيف، ويحذف جلسات التصويت.'],
    ['LuArchive', 'green', 'الأرشيف', 'يضيف ويعدّل ويحذف مستندات الأعوام السابقة.'],
    ['LuHardDrive', 'red', 'المساحة', 'يراقب امتلاء التخزين وقاعدة البيانات بشريطين وتنبيهات.'],
    ['LuEye', 'blue', 'رؤية كل شيء', 'يرى حتى تقارير لجنة الرقابة قبل اعتمادها، ويرفع أي نوع مستند.'],
  ];
  for (let i = 0; i < 6; i++) {
    const row = Math.floor(i / 3);
    const { x, w } = tile3(i % 3);
    await d.card(s, { x, y: 1.6 + row * 2.7, w, h: 2.5, name: caps[i][0], tone: caps[i][1], title: caps[i][2], body: caps[i][3], d: 0.7, titleSize: 19, bodySize: 14 });
  }

  s = d.light('لوحة المطوّر ١: المستخدمون وتسليم المقعد');
  await d.flow(s, {
    y: 1.65, h: 2.0,
    steps: [
      { title: 'المستخدمون ← تعديل', body: 'على الحساب المراد تسليمه' },
      { title: 'بيانات الشخص الجديد', body: 'الاسم واسم المستخدم والبريد' },
      { title: 'كلمة مرور جديدة', body: 'إلزامية عند تغيير اسم المستخدم' },
      { title: 'حفظ', body: 'يسري فورًا', tone: 'dark' },
    ],
  });
  await d.card(s, { x: tile3(0, 2).x, y: 3.95, w: tile3(0, 2).w, h: 2.75, name: 'LuLock', tone: 'red', title: 'ماذا يتوقف فورًا؟', body: 'كلمة المرور القديمة وكل جلسات الشخص السابق على أي جهاز.' });
  await d.card(s, { x: tile3(1, 2).x, y: 3.95, w: tile3(1, 2).w, h: 2.75, name: 'LuHistory', tone: 'green', title: 'ماذا يبقى؟', body: 'مستندات المقعد القديمة محفوظة، وتظهر باسم الشخص الجديد.' });

  s = d.light('لوحة المطوّر ٢: الأعوام وحذف عام');
  await d.flow(s, {
    y: 1.65, h: 1.7,
    steps: [
      { title: 'بدء عام جديد', body: 'اسم وتاريخ بداية' },
      { title: 'يُؤرشف السابق', body: 'للقراءة فقط، دون حذف', tone: 'good' },
    ],
  });
  // delete dialog mock
  const mx = L, mw = 6.4;
  d.panel(s, { x: mx, y: 3.55, w: mw, h: 3.3 });
  d.text(s, 'حذف عام 2025/2026', { x: mx + 0.3, y: 3.7, w: mw - 0.6, h: 0.45, fontSize: 19, bold: true, color: C.navy });
  s.addShape(d.pres.shapes.ROUNDED_RECTANGLE, { x: mx + 0.3, y: 4.2, w: mw - 0.6, h: 1.25, rectRadius: 0.08, fill: { color: 'FDF1F2' }, line: { color: TONES.red.border, width: 0.75 } });
  d.text(s, 'تحذير: لا يمكن التراجع. سيُحذف ١٤١ مستندًا مع مراجعاتها، وجلسات التصويت، وملفاتها من التخزين.', { x: mx + 0.5, y: 4.3, w: mw - 1.0, h: 1.05, fontSize: 14, color: '7D1F29', valign: 'middle' });
  s.addShape(d.pres.shapes.ROUNDED_RECTANGLE, { x: mx + 0.3, y: 5.6, w: mw - 2.5, h: 0.5, rectRadius: 0.06, fill: { color: C.white }, line: { color: 'CDD5E0', width: 1 } });
  d.text(s, '2025/2026', { x: mx + 0.4, y: 5.6, w: mw - 2.7, h: 0.5, fontSize: 14, color: C.muted, align: 'left', valign: 'middle', rtlMode: false });
  s.addShape(d.pres.shapes.ROUNDED_RECTANGLE, { x: mx + mw - 2.1, y: 5.6, w: 1.8, h: 0.5, rectRadius: 0.06, fill: { color: C.red, transparency: 45 }, line: { type: 'none' } });
  d.text(s, 'حذف نهائيًا', { x: mx + mw - 2.1, y: 5.6, w: 1.8, h: 0.5, fontSize: 14, bold: true, align: 'center', valign: 'middle', color: C.white });
  d.text(s, 'الزر يبقى معطّلًا حتى تكتب اسم العام بالضبط', { x: mx + 0.3, y: 6.25, w: mw - 0.6, h: 0.4, fontSize: 13, color: C.muted });
  d.bullets(s, [
    { b: 'التأكيد الكتابي:', t: 'اسم العام نفسه، لمنع الحذف بالخطأ.' },
    { b: 'ماذا يُحذف:', t: 'المستندات والمراجعات وجلسات التصويت وملفات Cloudinary.' },
    { b: 'حماية:', t: 'لا يمكن حذف العام الوحيد؛ وإن حُذف الحالي صار أحدث عام متبقٍّ هو الحالي.' },
  ], { x: 7.3, y: 3.6, w: R - 7.3, h: 3.2, size: 15, space: 8 });

  s = d.light('لوحة المطوّر ٣: المساحة');
  const bars = [
    ['الملفات (Cloudinary)', 0.86, 'amber', '٨٦٪ · مثال توضيحي', 'المساحة تمتلئ، يُنصح بالتخطيط للتوسعة'],
    ['قاعدة البيانات (Neon)', 0.02, 'green', '٢٪ · مثال توضيحي', 'المساحة كافية'],
  ];
  for (let i = 0; i < 2; i++) {
    const y = 1.7 + i * 1.65;
    d.panel(s, { x: L, y, w: 7.7, h: 1.45 });
    d.text(s, bars[i][0], { x: L + 0.3, y: y + 0.18, w: 7.1, h: 0.4, fontSize: 18, bold: true, color: C.navy });
    d.text(s, bars[i][3], { x: L + 0.3, y: y + 0.18, w: 3, h: 0.4, fontSize: 14, color: C.muted, align: 'left', rtlMode: false });
    s.addShape(d.pres.shapes.ROUNDED_RECTANGLE, { x: L + 0.3, y: y + 0.7, w: 7.1, h: 0.22, rectRadius: 0.11, fill: { color: 'E9EDF3' }, line: { type: 'none' } });
    const bw = Math.max(0.3, 7.1 * bars[i][1]);
    s.addShape(d.pres.shapes.ROUNDED_RECTANGLE, { x: L + 0.3 + 7.1 - bw, y: y + 0.7, w: bw, h: 0.22, rectRadius: 0.11, fill: { color: TONES[bars[i][2]].fg }, line: { type: 'none' } });
    d.text(s, bars[i][4], { x: L + 0.3, y: y + 1.0, w: 7.1, h: 0.35, fontSize: 13, color: C.muted });
  }
  await d.card(s, { x: 8.7, y: 1.7, w: R - 8.7, h: 3.1, name: 'LuBell', tone: 'amber', title: 'مستويات التنبيه', body: 'أخضر: كافية. أصفر من ٧٥٪. أحمر من ٩٠٪. ممتلئة عند ١٠٠٪. يُحدَّث الشريط كل ٥ دقائق.' });
  await d.callout(s, { x: L, y: 5.1, w: CW, h: 1.5, tone: 'blue', name: 'LuHardDrive', text: 'يظهر شريط مصغّر في أعلى الصفحة للمطوّر وحده، يعرض الأعلى امتلاءً من المساحتين. الحدود الافتراضية: ٢٥ جيجابايت للملفات و٥١٢ ميجابايت لقاعدة البيانات، وتُضبط بمتغيرات في الاستضافة.' });

  s = d.light('قواعد الحذف');
  d.table(s, {
    x: L, y: 1.7, w: CW, colW: [2.6, 4.0, CW - 6.6], rowH: 0.7, fontSize: 14,
    header: ['ماذا؟', 'من يحذف؟', 'ماذا يحدث؟'],
    rows: [
      ['مستند', 'صاحبه (قبل القبول وفي العام الحالي) أو المطوّر', 'يُحذف السجل والمراجعات؛ الملف يبقى في Cloudinary احتياطًا'],
      ['جلسة تصويت', 'المطوّر فقط', 'تُحذف مع خياراتها وأصواتها'],
      ['عام كامل', 'المطوّر فقط، بكتابة اسم العام', 'يُحذف كل ما فيه بما فيه الملفات'],
      ['حساب مستخدم', 'لا يُحذف', 'يُسلَّم المقعد لشخص جديد بدل الحذف'],
    ],
  });
  await d.callout(s, { x: L, y: 6.15, w: CW, h: 0.7, tone: 'amber', name: 'LuTriangleAlert', text: 'الحذف لا رجعة فيه من داخل النظام. لهذا حُصر في المطوّر، وجُعل لصاحب المستند قبل اعتماده فقط.' });

  // ---- technical ----
  s = d.light('البنية التقنية');
  const boxes = [
    ['LuGlobe', 'blue', 'المتصفح', 'React + Vite، واجهة عربية RTL'],
    ['LuServer', 'red', 'Vercel', 'تطبيق Express كدالة واحدة، يحمل الواجهة والـAPI'],
    ['LuDatabase', 'green', 'Neon PostgreSQL', 'المستخدمون والمستندات والمراجعات والتصويت والأعوام'],
  ];
  const bw = (CW - 2 * 0.7) / 3;
  const chev = await icon('LuChevronLeft', C.red);
  for (let i = 0; i < 3; i++) {
    const x = R - (i + 1) * bw - i * 0.7;
    await d.card(s, { x, y: 1.6, w: bw, h: 2.75, name: boxes[i][0], tone: boxes[i][1], title: boxes[i][2], body: boxes[i][3], d: 0.7, titleSize: 19, bodySize: 14 });
    if (i < 2) s.addImage({ data: chev, x: x - 0.7 + 0.18, y: 2.8, w: 0.34, h: 0.34, altText: '' });
  }
  const lower = [
    ['LuCloud', 'amber', 'Cloudinary', 'ملفات المستندات المرفوعة'],
    ['LuKeyRound', 'navy', 'Better Auth', 'وضع دخول بديل: جاهز في الشفرة ولم يُفعَّل بعد'],
    ['LuRocket', 'green', 'النشر', 'GitHub ثم Vercel تلقائيًا عند كل تحديث'],
  ];
  for (let i = 0; i < 3; i++) {
    const x = R - (i + 1) * bw - i * 0.7;
    await d.card(s, { x, y: 4.55, w: bw, h: 2.3, name: lower[i][0], tone: lower[i][1], title: lower[i][2], body: lower[i][3], d: 0.6, titleSize: 18, bodySize: 14 });
  }

  s = d.light('الأمان وقاعدة البيانات');
  d.bullets(s, [
    { b: 'كلمات المرور:', t: 'تُشفَّر بـscrypt مع ملح لكل مستخدم، ولا تُحفظ نصًا.' },
    { b: 'الجلسة:', t: 'ملف ارتباط موقَّع ليوم واحد؛ تغيير كلمة المرور يُنهي كل الجلسات الأخرى.' },
    { b: 'الدخول:', t: 'باسم المستخدم أو البريد، وبحد ٣٠ محاولة كل ١٥ دقيقة.' },
    { b: 'التسجيل:', t: 'مغلق؛ المطوّر وحده ينشئ الحسابات ويمنح الأدوار.' },
    { b: 'الصلاحيات:', t: 'تُفحص في الخادم لكل طلب، وأي طلب يغيّر بيانات يجب أن يأتي من الموقع نفسه.' },
    { b: 'الأسرار:', t: 'في إعدادات الاستضافة فقط، ولا تُرفع إلى المستودع.' },
  ], { x: 6.6, y: 1.65, w: R - 6.6, h: 5.1, size: 16, space: 9 });
  d.panel(s, { x: L, y: 1.65, w: 5.6, h: 5.1 });
  d.text(s, 'جداول قاعدة البيانات', { x: L + 0.3, y: 1.85, w: 5.0, h: 0.5, fontSize: 20, bold: true, color: C.navy });
  const tbls = ['Users', 'Roles', 'RoleDocPerms', 'Documents', 'DocumentTypes', 'Reviews', 'VoteSessions', 'VoteOptions', 'Votes', 'Cycles', 'Quarters'];
  tbls.forEach((t, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = L + 0.3 + (1 - col) * 2.6, y = 2.55 + row * 0.68;
    s.addShape(d.pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 2.4, h: 0.5, rectRadius: 0.08, fill: { color: i === 9 ? TONES.red.bg : C.canvas }, line: { color: i === 9 ? TONES.red.border : C.line, width: 0.75 } });
    d.text(s, t, { x, y, w: 2.4, h: 0.5, fontSize: 14, bold: i === 9, align: 'center', valign: 'middle', color: C.navy, rtlMode: false, fontFace: 'Courier New' });
  });

  s = d.light('التشغيل: أوامر وإعدادات');
  d.panel(s, { x: tile3(0, 2).x, y: 1.65, w: tile3(0, 2).w, h: 5.1, fill: C.navy, line: C.navy });
  d.text(s, 'الأوامر', { x: tile3(0, 2).x + 0.3, y: 1.8, w: tile3(0, 2).w - 0.6, h: 0.5, fontSize: 20, bold: true, color: C.white });
  const cmds = ['npm run dev', 'npm test', 'npm run build', 'npm run db:upgrade', 'npm run create-developer', 'npm run check:db'];
  cmds.forEach((c, i) => d.text(s, c, { x: tile3(0, 2).x + 0.3, y: 2.5 + i * 0.66, w: tile3(0, 2).w - 0.6, h: 0.5, fontSize: 16, color: 'E6EAF2', fontFace: 'Courier New', rtlMode: false, align: 'left', valign: 'middle' }));
  d.panel(s, { x: tile3(1, 2).x, y: 1.65, w: tile3(1, 2).w, h: 5.1 });
  d.text(s, 'متغيرات الاستضافة (Vercel)', { x: tile3(1, 2).x + 0.3, y: 1.8, w: tile3(1, 2).w - 0.6, h: 0.5, fontSize: 20, bold: true, color: C.navy });
  const envs = ['DATABASE_URL', 'CLOUDINARY_URL', 'APP_ORIGIN', 'AUTH_PROVIDER', 'JWT_SECRET', 'NEON_AUTH_URL'];
  envs.forEach((c, i) => d.text(s, c, { x: tile3(1, 2).x + 0.3, y: 2.5 + i * 0.66, w: tile3(1, 2).w - 0.6, h: 0.5, fontSize: 15, color: C.ink, fontFace: 'Courier New', rtlMode: false, align: 'left', valign: 'middle' }));

  s = d.light('حدود معروفة وخطط التطوير');
  d.table(s, {
    x: L, y: 1.65, w: CW, colW: [2.9, 4.3, CW - 7.2], rowH: 0.85, fontSize: 14,
    header: ['الموضوع', 'الوضع الحالي', 'الخطوة القادمة'],
    rows: [
      ['حجم الملف', 'الاستضافة ترفض أكثر من نحو ٤٫٥ ميجابايت', 'الرفع مباشرة من المتصفح إلى Cloudinary بتوقيع مؤقت'],
      ['نسيت كلمة المرور', 'غير متاحة؛ لا يوجد مرسِل بريد', 'تفعيل Better Auth: إضافة الموقع للنطاقات، واختبار البريد، وتفعيل كل مستخدم ببريده'],
      ['الإشعارات', 'لا بريد ولا إشعارات', 'تنبيه عند طلب مراجعة أو فتح تصويت'],
      ['سجل العمليات', 'غير موجود', 'تسجيل من حذف أو عدّل ماذا ومتى'],
    ],
  });
  await d.callout(s, { x: L, y: 6.0, w: CW, h: 0.75, tone: 'blue', text: 'التفاصيل التقنية الكاملة وقواعد العمل في ملف AGENTS.md داخل المستودع.' });

  await d.closingSlide({ title: 'شكرًا لكم', line: 'نظام مرتّب وصلاحيات واضحة وأرشيف يحفظ تاريخ الاتحاد.', note: 'الدليل المطبوع (PDF) وملف AGENTS.md في مجلد docs والمستودع' });
  await d.write('YOD-presentation-full-ar.pptx');
}

await buildUsers();
await buildFull();
