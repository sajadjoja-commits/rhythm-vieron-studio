// Custom local (Iraq) manual payment configuration for Vireon.
// No global gateways (Stripe / AdSense / Lemon Squeezy) — 100% manual/local.
//
// Fill the placeholder numbers below with your real wallet/card numbers.

export interface PayMethod {
  id: string;
  title: string;
  /** Full sensitive value the user needs to copy (number / card). */
  value?: string;
  /** How many trailing chars stay visible when masked (rest -> ****). */
  reveal?: number;
  /** Extra labelled fields (e.g. cardholder name). */
  fields?: { label: string; value: string; sensitive?: boolean; reveal?: number }[];
  /** Free-text instructions / guide. */
  note?: string;
  steps?: string[];
}

export const PRICE_LABEL = "Vireon Premium";

export interface Plan {
  id: string;
  title: string;
  titleEn: string;
  /** Price in USD. */
  price: number;
  /** Billing period label. */
  period: string;
  periodEn: string;
  /** Optional badge (e.g. "الأكثر شيوعاً"). */
  badge?: string;
  /** Effective monthly note for annual plans. */
  note?: string;
}

export const PLANS: Plan[] = [
  {
    id: "weekly",
    title: "أسبوعي",
    titleEn: "Weekly",
    price: 5,
    period: "/ أسبوع",
    periodEn: "/ week",
  },
  {
    id: "monthly",
    title: "شهري",
    titleEn: "Monthly",
    price: 12,
    period: "/ شهر",
    periodEn: "/ month",
    badge: "الأكثر شيوعاً",
  },
  {
    id: "yearly",
    title: "سنوي",
    titleEn: "Yearly",
    price: 25,
    period: "/ سنة",
    periodEn: "/ year",
    badge: "أفضل قيمة",
    note: "أقل من 2.1$ شهرياً",
  },
];

export const PAY_METHODS: PayMethod[] = [
  {
    id: "qicard",
    title: "ماستر كارد (MasterCard)",
    value: "8435331767",
    reveal: 4,
    fields: [{ label: "اسم صاحب البطاقة", value: "SAJJAD JASIM YAS" }],
    steps: [
      "من تطبيق مصرف الرافدين / Qi أو أي محفظة محلية اختر: تحويل إلى بطاقة ماستر كارد.",
      "أدخل رقم البطاقة أعلاه وأكمل التحويل بالمبلغ المطلوب.",
      "أرسل رقم العملية في النموذج بالأسفل لتفعيل اشتراكك.",
    ],
  },
];

export interface PaySubmission {
  method: string;
  plan?: string;
  amount?: number;
  reference: string;
  receipt?: string; // data URL of uploaded screenshot (optional)
  at: number;
}

const SUB_KEY = "vireon:payments";

export function savePaymentSubmission(sub: PaySubmission): void {
  try {
    const list: PaySubmission[] = JSON.parse(localStorage.getItem(SUB_KEY) || "[]");
    list.push(sub);
    localStorage.setItem(SUB_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function getPaymentSubmissions(): PaySubmission[] {
  try {
    return JSON.parse(localStorage.getItem(SUB_KEY) || "[]");
  } catch {
    return [];
  }
}

/** Mask a value keeping the last `reveal` characters visible. */
export function maskValue(value: string, reveal = 0): string {
  if (!value) return "";
  if (reveal <= 0) return "•".repeat(Math.min(value.length, 10));
  const tail = value.slice(-reveal);
  return "•".repeat(Math.max(0, value.length - reveal)) + tail;
}
