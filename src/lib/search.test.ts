import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchIndex, highlight, matchesText, normalize, search } from './search.js';
import type { Cycle, Document, VoteSession } from '../types';

const cycles: Cycle[] = [
  {
    cycleId: 1,
    name: '2025/2026',
    startDate: '2025-09-01',
    endDate: '2026-08-31',
    isCurrent: false,
    documentCount: 2,
    voteCount: 1,
  },
  {
    cycleId: 2,
    name: '2026/2027',
    startDate: '2026-09-01',
    endDate: null,
    isCurrent: true,
    documentCount: 0,
    voteCount: 0,
  },
];
const doc = (docId: number, title: string, cycleId: number, createdAt: string): Document => ({
  docId,
  title,
  ownerUserId: 1,
  ownerName: 'أحمد',
  roleId: 7,
  roleName: 'مسؤول أنشطة',
  docTypeId: 2,
  typeName: 'تقرير',
  quarterId: 1,
  quarterName: 'الربع الأول',
  status: 'لا يحتاج إلى مراجعة',
  eventDate: createdAt,
  createdAt,
  cycleId,
  reviews: [],
});
const vote = {
  sessionId: 1,
  title: 'اعتماد خطة الأنشطة',
  description: 'تصويت',
  status: 'مغلقة',
  decision: 'موافق',
  createdByUserId: 1,
  createdByName: 'رئيس',
  createdAt: '2026-01-01',
  cycleId: 1,
  closedAt: null,
  voteCount: 3,
  myOptionId: null,
  options: [{ optionId: 1, text: 'موافق', count: 3 }],
} as VoteSession;
const index = buildSearchIndex({
  documents: [
    doc(1, 'تقرير إدارة الأنشطة', 1, '2026-02-01'),
    doc(2, 'خطة الدعم الأكاديمي', 2, '2026-10-01'),
    doc(3, 'أنشطة الصيف', 1, '2026-06-01'),
  ],
  votes: [vote],
  cycles,
  roles: [
    { roleId: 7, roleName: 'مسؤول أنشطة' },
    { roleId: 11, roleName: 'مطوّر' },
  ],
  pages: [{ to: '/votes', label: 'جلسات التصويت' }],
  commands: [
    {
      key: 'upload',
      title: 'إضافة مستند جديد',
      subtitle: 'رفع ملف',
      keywords: 'رفع ملف تحميل upload',
      action: { type: 'command', command: 'upload' },
    },
    {
      key: 'pw',
      title: 'تغيير كلمة المرور',
      subtitle: 'حسابي',
      keywords: 'كلمه السر باسورد',
      action: { type: 'path', to: '/account#password' },
    },
  ],
  isCommittee: role => role.roleId !== 11,
});

test('folding ignores diacritics, hamza/ya/ta-marbuta variants and Arabic digits', () => {
  assert.equal(normalize('إِدَارَة'), normalize('اداره'));
  assert.equal(normalize('مَدْرَسَة'), normalize('مدرسه'));
  assert.equal(normalize('٢٠٢٦'), '2026');
  assert.equal(matchesText('تقرير الأنشطة', 'انشطه تقرير'), true);
  assert.equal(matchesText('تقرير الأنشطة', 'مالية'), false);
});

test('every term must match; title matches rank above matches in other fields', () => {
  const titles = search(index, 'أنشطة').map(r => r.title);
  assert.ok(titles.indexOf('أنشطة الصيف') < titles.indexOf('تقرير إدارة الأنشطة'), 'prefix match first');
  assert.deepEqual(
    search(index, 'أنشطة مالية')
      .map(r => r.key)
      .filter(k => k.startsWith('doc:')),
    [],
  );
  assert.ok(
    search(index, 'مسؤول أنشطة').some(r => r.key === 'doc:2' || r.key === 'doc:1'),
    'owner role field is searchable',
  );
});

test('archived items carry their year, and documents from every cycle are found', () => {
  const found = search(index, 'خطة');
  assert.equal(found.find(r => r.key === 'doc:2')?.badge, undefined);
  assert.equal(search(index, 'أنشطة الصيف')[0].badge, '2025/2026');
  assert.ok(found.some(r => r.key === 'vote:1'));
});

test('empty query lists pages; the developer role is not offered as a committee', () => {
  assert.deepEqual(
    search(index, '  ').map(r => r.key),
    ['page:/votes', 'cmd:upload', 'cmd:pw'],
  );
  assert.ok(search(index, 'مسؤول').some(r => r.key === 'role:7'));
  assert.equal(
    search(index, 'مطوّر').some(r => r.group === 'committees'),
    false,
  );
});

test('highlight marks matches in the original spelling, including through diacritics', () => {
  assert.deepEqual(highlight('تقرير الأنشطة', 'انشطه'), [
    { text: 'تقرير ال', match: false },
    { text: 'أنشطة', match: true },
  ]);
  assert.deepEqual(highlight('بدون', ''), [{ text: 'بدون', match: false }]);
});

test('search reaches functionality: actions are found by their name or by everyday synonyms', () => {
  assert.equal(search(index, 'رفع ملف')[0].key, 'cmd:upload');
  assert.equal(search(index, 'باسورد')[0].key, 'cmd:pw', 'informal word for password');
  assert.equal(search(index, 'كلمة السر')[0].key, 'cmd:pw', 'ta marbuta / alef variants are folded');
  assert.deepEqual(
    search(index, 'upload').map(r => r.group),
    ['actions'],
    'English keyword',
  );
  assert.deepEqual(search(index, 'كلمة المرور')[0].action, { type: 'path', to: '/account#password' });
});
