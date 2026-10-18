/**
 * Arabic Spell Check & Auto-Correction for Whisper Transcripts
 * Uses a built-in high-frequency dictionary and Levenshtein edit-distance matching.
 * No external heavy libraries.
 */

// 1. Comprehensive list of high-frequency Arabic words (MSA & video/media terminology)
const ARABIC_DICTIONARY_RAW = [
  // Prepositions, pronouns, conjunctions, particles
  "في", "من", "على", "إلى", "عن", "مع", "هذا", "هذه", "ذلك", "تلك", "هؤلاء", "الذي", "التي", "الذين", "أنا", "أنت", "هو", "هي", "نحن", "أنتم", "هم",
  "ما", "ماذا", "كيف", "لماذا", "متى", "أين", "هل", "كم", "أي", "كل", "بعض", "غير", "دون", "بعد", "قبل", "بين", "عند", "حتى", "ثم", "أو", "بل", "لكن",
  "إذا", "إن", "أن", "كان", "كانت", "يكون", "تكون", "كانوا", "ليس", "ليست", "أكثر", "أفضل", "أكبر", "أصغر", "جدا", "أيضا", "هناك", "هنا", "الآن", "اليوم",
  "أمس", "غدا", "دائما", "أبدا", "أولا", "ثانيا", "ثالثا", "أخيرا", "نعم", "لا", "بلى", "ربما", "فقط", "معا", "سويا", "شخص", "أشخاص", "شيء", "أشياء",

  // Common verbs
  "قال", "يقول", "قالت", "تقول", "قالوا", "رأيت", "ترى", "يرى", "شاهد", "تشاهد", "يشاهد", "اشترك", "يشترك", "تفضل", "اعمل", "يعمل", "تعمل", "تريد", "يريد",
  "تريدون", "تقدر", "يقدر", "تعرف", "يعرف", "نعرف", "حدث", "يحدث", "سمعت", "سمع", "يسمع", "كتبت", "يكتب", "قرأت", "يقرأ", "تواصل", "شارك", "يشارك",
  "اضغط", "اعجبك", "متابعة", "تفعيل", "فتح", "إغلاق", "استخدم", "يستخدم", "تصفح", "حمل", "تحميل", "نزل", "رفع", "تحرير", "تعديل", "تصميم", "إنتاج",
  "تسجيل", "تشغيل", "بحث", "يبحث", "إضافة", "حذف", "حفظ", "مشاركة", "نشر", "تأكيد", "اختيار", "مساعدة", "متابعين", "حصل", "يحصل", "بدأ", "يبدأ",

  // Media, Video, App & Studio domain
  "فيديو", "استوديو", "مقطع", "مقاطع", "صورة", "صور", "تصميم", "تصاميم", "صوت", "أصوات", "موسيقى", "تأثيرات", "فلاتر", "مونتاج", "قناة", "تطبيق",
  "هاتف", "جوال", "شاشة", "كابشن", "نص", "كتابة", "شرح", "خطوة", "خطوات", "طريقة", "فكرة", "أفكار", "مشروع", "محتوى", "صانع", "يوتيوب", "تيك", "توك",
  "إنستغرام", "حساب", "إعجاب", "ريلز", "سناب", "شورتس", "جودة", "عالي", "دقة", "حركات", "ألوان", "تفاصيل", "سرعة", "بطيء", "خلفية", "إطار", "قالب",
  "مبتدئ", "احترافي", "تعديل", "مونتير", "منصة", "رابط", "موقع", "تحميل", "مباشر", "بث", "مشاهدة", "متابعة", "زر", "واجهة", "قائمة", "إعدادات",

  // Everyday, greetings, and common phrases
  "سلام", "عليكم", "ورحمة", "الله", "وبركاته", "مرحبا", "أهلا", "سهلا", "شكرا", "جزيل", "أخي", "أختي", "صديقي", "جميعا", "إخواني", "أخواتي", "عزيزي",
  "عزيزتي", "حقيقة", "معلومة", "سر", "نصيحة", "تجربة", "نتيجة", "مشكلة", "حل", "حلول", "سهل", "سهلة", "ممتاز", "رائع", "قادم", "سابق", "جديد", "قديم",
  "عالم", "ناس", "حياة", "وقت", "زمن", "ساعة", "دقيقة", "ثانية", "كلمة", "لغة", "عربية", "عربي", "تطوير", "نجاح", "عمل", "معلومات", "شاهدوا", "اشتركوا",
  "الرابط", "الوصف", "الصندوق", "التعليقات", "التعليق", "شاركوا", "تفعيل", "الجرس", "الإشعارات", "المستقبل", "الأول", "الثاني", "الثالث", "الجديد", "اليوم"
];

// Helper to normalize Arabic character variations for distance/search comparison
export function normalizeArabicForSearch(text: string): string {
  if (!text) return "";
  return text
    .replace(/ـ+/g, "") // Remove Tatweel
    .replace(/[\u064B-\u065F\u0670]/g, "") // Remove short vowels/tashkeel
    .replace(/[أإآٱ]/g, "ا") // Standardize Alef
    .replace(/ة/g, "ه") // Standardize Taa Marbouta to Haa for comparison
    .replace(/ى/g, "ي") // Standardize Alef Maqsura to Yaa
    .trim();
}

// Map of normalized word -> array of clean original dictionary words
const normToOrigMap = new Map<string, string>();
const normWordSet = new Set<string>();
const lengthBuckets = new Map<number, Array<{ orig: string; norm: string }>>();

// Populate normalized dictionary lookup structures
ARABIC_DICTIONARY_RAW.forEach((word) => {
  const norm = normalizeArabicForSearch(word);
  if (!norm) return;
  normWordSet.add(norm);
  if (!normToOrigMap.has(norm)) {
    normToOrigMap.set(norm, word);
  }
  const len = norm.length;
  if (!lengthBuckets.has(len)) {
    lengthBuckets.set(len, []);
  }
  lengthBuckets.get(len)!.push({ orig: word, norm });
});

/**
 * Optimized Levenshtein distance algorithm using single-row memory.
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const row = new Int32Array(n + 1);
  for (let j = 0; j <= n; j++) {
    row[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    let prevDiag = row[0];
    row[0] = i;
    const char1 = str1.charCodeAt(i - 1);

    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      const cost = char1 === str2.charCodeAt(j - 1) ? 0 : 1;
      row[j] = Math.min(
        row[j] + 1,       // Deletion
        row[j - 1] + 1,   // Insertion
        prevDiag + cost   // Substitution
      );
      prevDiag = temp;
    }
  }

  return row[n];
}

/**
 * Single Arabic word spell corrector
 */
export function correctArabicWord(wordToken: string): string {
  if (!wordToken || wordToken.length < 3) return wordToken;

  // Extract leading/trailing punctuation (e.g. "فيديو،" -> word "فيديو", punct "،")
  const match = wordToken.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}]+)([^\p{L}\p{N}]*)$/u);
  if (!match) return wordToken;

  const prefix = match[1];
  const coreWord = match[2];
  const suffix = match[3];

  // Only attempt correction if the core contains Arabic characters
  if (!/[\u0600-\u06FF]/.test(coreWord)) {
    return wordToken;
  }

  const norm = normalizeArabicForSearch(coreWord);
  if (norm.length < 3) return wordToken;

  // If normalized word exists in dictionary, return word unchanged (exact match)
  if (normWordSet.has(norm)) {
    return wordToken;
  }

  // Determine max allowed edit distance
  let maxDist = 1;
  if (norm.length >= 6) {
    maxDist = 2;
  }

  let bestMatch: string | null = null;
  let minDistance = maxDist + 1;

  // Search in length buckets within [norm.length - maxDist, norm.length + maxDist]
  for (let len = norm.length - maxDist; len <= norm.length + maxDist; len++) {
    const bucket = lengthBuckets.get(len);
    if (!bucket) continue;

    for (let i = 0; i < bucket.length; i++) {
      const candidate = bucket[i];
      const dist = levenshteinDistance(norm, candidate.norm);

      if (dist < minDistance && dist <= maxDist) {
        // High confidence check: relative edit ratio must be <= 35%
        if (dist / norm.length <= 0.35) {
          minDistance = dist;
          bestMatch = candidate.orig;
          if (dist === 1 && norm.length <= 4) {
            // Early break if perfect 1-edit on short word
            break;
          }
        }
      }
    }
    if (minDistance === 1 && norm.length <= 4) break;
  }

  if (bestMatch && minDistance <= maxDist) {
    return `${prefix}${bestMatch}${suffix}`;
  }

  return wordToken;
}

/**
 * Correct full Arabic string/sentence
 */
export function correctArabicText(text: string): string {
  if (!text) return "";
  const words = text.split(/\s+/);
  const corrected = words.map(correctArabicWord);
  return corrected.join(" ");
}
