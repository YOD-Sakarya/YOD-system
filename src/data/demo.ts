import type { Data, User } from '../types';
/** Sample data for the read-only design preview; nothing here is sent to or read from the API. */
export const demoUser: User = { userId: -1, fullName: 'عضو الهيئة التنفيذية', roleId: 3, roleName: 'أمين عام' };
const roles = [
  'رئيس الهيئة التنفيذية',
  'نائب الرئيس',
  'أمين عام',
  'مسؤول مالي',
  'مسؤول علاقات',
  'مسؤول أكاديمي',
  'مسؤول أنشطة',
  'مسؤولة طالبات',
  'مسؤول إعلامي',
  'رئيس لجنة الرقابة',
].map((roleName, i) => ({ roleId: i + 1, roleName }));
const types = ['تصور', 'تقرير', 'بيان', 'محضر', 'خطة'].map((typeName, i) => ({ docTypeId: i + 1, typeName }));
const quarters = ['الربع الأول', 'الربع الثاني', 'الربع الثالث', 'الربع الرابع'].map((quarterName, i) => ({
  quarterId: i + 1,
  quarterName,
}));
const now = new Date();
const relative = (days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12).toISOString();
const quarterId = Math.floor(now.getMonth() / 3) + 1;
const permissionTypes = [
  [1, 2, 3],
  [1, 2],
  [1, 2, 3, 4],
  [1, 2],
  [1, 2, 5],
  [1, 2, 5],
  [1, 2, 5],
  [1, 2, 5],
  [1, 2, 5],
  [2],
];
export const demoData: Data = {
  catalog: {
    roles,
    types,
    quarters,
    permissions: permissionTypes.flatMap((ids, i) => ids.map(docTypeId => ({ roleId: i + 1, docTypeId }))),
  },
  documents: [
    ['تصور الملتقى الطلابي السنوي', 7, 1, 3, 'قيد المراجعة'],
    ['تقرير الأنشطة الثقافية', 7, 2, -2, 'لا يحتاج إلى مراجعة'],
    ['خطة الدعم الأكاديمي للطلاب', 6, 5, 6, 'لا يحتاج إلى مراجعة'],
    ['محضر اجتماع الهيئة التنفيذية', 3, 4, -1, 'لا يحتاج إلى مراجعة'],
    ['تصور استقبال الطلاب المستجدين', 5, 1, 10, 'مقبول'],
    ['تصور اللقاء التعريفي للطالبات', 8, 1, 12, 'قيد المراجعة'],
    ['تقرير التغطية الإعلامية', 9, 2, -4, 'لا يحتاج إلى مراجعة'],
    ['تصور البرنامج الرياضي', 7, 1, 15, 'قيد المراجعة'],
  ].map(([title, role, type, offset, status], i) => ({
    docId: i + 1,
    title: String(title),
    ownerUserId: Number(role),
    ownerName: 'عضو اللجنة',
    roleId: Number(role),
    roleName: roles[Number(role) - 1].roleName,
    docTypeId: Number(type),
    typeName: types[Number(type) - 1].typeName,
    quarterId,
    quarterName: quarters[quarterId - 1].quarterName,
    status: String(status),
    eventDate: relative(Number(offset)),
    createdAt: relative(-i),
    cycleId: 1,
    reviews:
      Number(type) === 1
        ? (status === 'مقبول' ? [1, 3, 4] : [1]).map((roleId, j) => ({
            reviewId: i * 10 + j,
            reviewerId: roleId,
            reviewerName: roles[roleId - 1].roleName,
            roleId,
            roleName: roles[roleId - 1].roleName,
            decision: 'مقبول',
            comment: 'تمت مراجعة التصور والموافقة عليه.',
            reviewedAt: relative(-1),
          }))
        : [],
  })),
  cycles: [
    {
      cycleId: 1,
      name: '2026/2027',
      startDate: '2026-09-01',
      endDate: null,
      isCurrent: true,
      documentCount: 8,
      voteCount: 2,
    },
  ],
  votes: [
    {
      sessionId: 1,
      title: 'موعد الملتقى الطلابي القادم',
      description: 'اختيار الموعد الأنسب لإقامة الملتقى، بما يتناسب مع الجدول الدراسي للطلاب.',
      status: 'مفتوحة',
      decision: null,
      cycleId: 1,
      createdByUserId: 1,
      createdByName: 'رئيس الهيئة التنفيذية',
      createdAt: relative(-1),
      closedAt: relative(4),
      voteCount: 7,
      myOptionId: null,
      options: [
        { optionId: 1, text: 'يوم السبت', count: 4 },
        { optionId: 2, text: 'يوم الأحد', count: 3 },
      ],
    },
    {
      sessionId: 2,
      title: 'اعتماد خطة الأنشطة',
      description: 'التصويت على خطة الأنشطة الثقافية والرياضية لهذا الفصل.',
      status: 'مغلقة',
      decision: 'موافق',
      cycleId: 1,
      createdByUserId: 3,
      createdByName: 'أمين عام',
      createdAt: relative(-9),
      closedAt: relative(-2),
      voteCount: 9,
      myOptionId: null,
      options: [
        { optionId: 3, text: 'موافق', count: 8 },
        { optionId: 4, text: 'غير موافق', count: 1 },
      ],
    },
  ],
};
