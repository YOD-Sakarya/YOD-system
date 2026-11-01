import type { SearchAction } from './search';

/** Something the user can do from the search box (open a dialog, jump to a setting, sign out…). */
export type CommandDef = {
  key: string;
  title: string;
  subtitle: string;
  /** Extra words that should find this command (synonyms, informal wording, English). */
  keywords: string;
  action: SearchAction;
};

type Options = {
  /** May upload documents in the year being viewed. */
  canUpload: boolean;
  /** May open new vote sessions in the year being viewed. */
  canCreateSession: boolean;
  developer: boolean;
};

const go = (to: string): SearchAction => ({ type: 'path', to });

/**
 * Everything the signed-in user can do, so the search box reaches functionality as well as documents.
 * Only commands the user is allowed to run are listed; the server still enforces every rule.
 */
export function buildCommands({ canUpload, canCreateSession, developer }: Options): CommandDef[] {
  const commands: CommandDef[] = [];
  if (canUpload)
    commands.push({
      key: 'upload',
      title: 'إضافة مستند جديد',
      subtitle: 'رفع ملف إلى مكتبة المستندات',
      keywords: 'رفع ملف تحميل اضافه انشاء مستند وثيقه تقرير تصور upload new document',
      action: { type: 'command', command: 'upload' },
    });
  if (canCreateSession)
    commands.push({
      key: 'new-session',
      title: 'جلسة تصويت جديدة',
      subtitle: 'فتح تصويت على قرار',
      keywords: 'انشاء اضافه تصويت قرار استفتاء vote new session',
      action: { type: 'command', command: 'new-session' },
    });
  commands.push(
    {
      key: 'review-pending',
      title: 'المستندات قيد المراجعة',
      subtitle: 'تصفية المكتبة: بانتظار الموافقات',
      keywords: 'معلقه منتظره بانتظار مراجعه pending',
      action: go('/documents?status=قيد المراجعة'),
    },
    {
      key: 'review-accepted',
      title: 'المستندات المقبولة',
      subtitle: 'تصفية المكتبة: تمت الموافقة',
      keywords: 'معتمده موافق عليها approved accepted',
      action: go('/documents?status=مقبول'),
    },
    {
      key: 'review-rejected',
      title: 'المستندات المرفوضة',
      subtitle: 'تصفية المكتبة: تم الرفض',
      keywords: 'رفض مرفوضه rejected',
      action: go('/documents?status=مرفوض'),
    },
    {
      key: 'account-password',
      title: 'تغيير كلمة المرور',
      subtitle: 'حسابي',
      keywords: 'كلمه السر باسورد الرقم السري تغيير تحديث password',
      action: go('/account#password'),
    },
    {
      key: 'account-email',
      title: 'تغيير البريد الإلكتروني',
      subtitle: 'حسابي',
      keywords: 'ايميل تغيير تحديث email mail',
      action: go('/account#email'),
    },
    {
      key: 'account',
      title: 'حسابي',
      subtitle: 'بياناتي وإعدادات الدخول',
      keywords: 'الملف الشخصي بروفايل اعدادات profile settings',
      action: go('/account'),
    },
    {
      key: 'logout',
      title: 'تسجيل الخروج',
      subtitle: 'إنهاء الجلسة',
      keywords: 'خروج انهاء logout sign out',
      action: { type: 'command', command: 'logout' },
    },
  );
  if (developer)
    commands.push(
      {
        key: 'admin-new-user',
        title: 'إضافة مستخدم',
        subtitle: 'لوحة المطوّر ‹ المستخدمون',
        keywords: 'حساب جديد عضو انشاء تسليم المقعد user account',
        action: go('/admin?tab=users&new=1'),
      },
      {
        key: 'admin-users',
        title: 'إدارة المستخدمين',
        subtitle: 'لوحة المطوّر',
        keywords: 'حسابات اعضاء ادوار صلاحيات users roles',
        action: go('/admin?tab=users'),
      },
      {
        key: 'admin-new-cycle',
        title: 'بدء عام جديد',
        subtitle: 'لوحة المطوّر ‹ الأعوام',
        keywords: 'دوره سنه جديده ارشيف cycle year new',
        action: go('/admin?tab=cycles&new=1'),
      },
      {
        key: 'admin-cycles',
        title: 'الأعوام وحذف عام',
        subtitle: 'لوحة المطوّر',
        keywords: 'دورات سنوات ارشيف حذف cycles archive delete',
        action: go('/admin?tab=cycles'),
      },
      {
        key: 'admin-storage',
        title: 'المساحة والتخزين',
        subtitle: 'لوحة المطوّر',
        keywords: 'تخزين سعه امتلاء ملفات قاعده البيانات storage space',
        action: go('/admin?tab=storage'),
      },
    );
  return commands;
}
