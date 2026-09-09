// Lightweight local notifications system for product updates & "what's new".
// Notifications are seeded statically (per app version) and read-state is
// persisted in localStorage. No backend required.

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  date: string; // ISO date
  emoji: string;
  tag: "جديد" | "تحديث" | "نصيحة";
}

// Bump this list whenever new features ship. Newest first.
export const NOTIFICATIONS: AppNotification[] = [
  {
    id: "2026-06-arabic-fonts",
    title: "خطوط عربية جديدة",
    body: "أضفنا مجموعة خطوط عربية احترافية (Changa, El Messiri, Reem Kufi والمزيد) لمحرر الكابشن.",
    date: "2026-06-06",
    emoji: "🔤",
    tag: "جديد",
  },
  {
    id: "2026-06-notifications",
    title: "مركز الإشعارات",
    body: "تابع كل جديد وتحديثات التطبيق من جرس الإشعارات في الأعلى.",
    date: "2026-06-06",
    emoji: "🔔",
    tag: "جديد",
  },
  {
    id: "2026-06-smart-templates",
    title: "القوالب الذكية",
    body: "ارفع فيديوهاتك ودع الذكاء الاصطناعي يطبّق التدرج اللوني والمؤثرات والقص على الإيقاع تلقائياً.",
    date: "2026-06-01",
    emoji: "✨",
    tag: "تحديث",
  },
  {
    id: "2026-06-monthly-reset",
    title: "استخدامات مجانية شهرية",
    body: "كل بداية شهر تُعاد تهيئة 5 استخدامات مجانية لكل من الكابشن والقص الذكي والقوالب الذكية.",
    date: "2026-06-01",
    emoji: "🎁",
    tag: "نصيحة",
  },
];

const SEEN_KEY = "vireon_notifications_seen_v1";
const DYNAMIC_KEY = "vireon_dynamic_notifications_v1";

export function getNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(DYNAMIC_KEY);
    const dynamic = raw ? (JSON.parse(raw) as AppNotification[]) : [];
    return [...dynamic, ...NOTIFICATIONS];
  } catch {
    return NOTIFICATIONS;
  }
}

export function addDynamicNotification(notification: AppNotification) {
  try {
    const raw = localStorage.getItem(DYNAMIC_KEY);
    const dynamic = raw ? (JSON.parse(raw) as AppNotification[]) : [];
    const filteredDynamic = dynamic.filter((n) => n.id !== notification.id);
    localStorage.setItem(DYNAMIC_KEY, JSON.stringify([notification, ...filteredDynamic]));
    window.dispatchEvent(new Event("vireon_notifications_updated"));
  } catch {
    /* ignore */
  }
}

function getSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function unreadCount(): number {
  const seen = new Set(getSeen());
  return getNotifications().filter((n) => !seen.has(n.id)).length;
}

export function isUnread(id: string): boolean {
  return !getSeen().includes(id);
}

export function markAllRead(): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(getNotifications().map((n) => n.id)));
    window.dispatchEvent(new Event("vireon_notifications_updated"));
  } catch {
    /* ignore */
  }
}
