/**
 * Tools Registry & Localization for AI Image Editing Tools
 */

export type ImageAITaskType = 'remove-bg' | 'inpaint' | 'outpaint';

export type ToolBadge = 'ready' | 'needs-download';

export interface ImageAIToolDefinition {
  id: ImageAITaskType;
  titleKey: string;
  descKey: string;
  iconName: 'Sparkles' | 'Wand2' | 'Maximize2';
  badge: ToolBadge;
  recommendedModelId?: string;
}

export const IMAGE_AI_TOOLS_REGISTRY: Record<ImageAITaskType, ImageAIToolDefinition> = {
  'remove-bg': {
    id: 'remove-bg',
    titleKey: 'imageAi.tools.removeBg.title',
    descKey: 'imageAi.tools.removeBg.desc',
    iconName: 'Sparkles',
    badge: 'ready',
    recommendedModelId: 'mediapipe-selfie'
  },
  'inpaint': {
    id: 'inpaint',
    titleKey: 'imageAi.tools.inpaint.title',
    descKey: 'imageAi.tools.inpaint.desc',
    iconName: 'Wand2',
    badge: 'ready',
    recommendedModelId: 'migan-512'
  },
  'outpaint': {
    id: 'outpaint',
    titleKey: 'imageAi.tools.outpaint.title',
    descKey: 'imageAi.tools.outpaint.desc',
    iconName: 'Maximize2',
    badge: 'ready',
    recommendedModelId: 'migan-512'
  }
};

export const TRANSLATIONS: Record<'ar' | 'en', Record<string, string>> = {
  ar: {
    'imageAi.tools.removeBg.title': 'عزل الخلفية',
    'imageAi.tools.removeBg.desc': 'عزل الخلفية الفائق مع مرشح موجّه عالي الدقة',
    'imageAi.tools.inpaint.title': 'إزالة العناصر',
    'imageAi.tools.inpaint.desc': 'إزالة العناصر غير المرغوبة وترميم مكانها بالدقة الأصلية',
    'imageAi.tools.outpaint.title': 'توسيع الصورة',
    'imageAi.tools.outpaint.desc': 'توسيع إطار الصورة محلياً بمد الخلفيات المتناسقة بدون إنترنت',
    'imageAi.outpaint.disclaimer': 'يمدّ الخلفيات البسيطة (سماء، عشب، جدران، نقوش). لا يرسم أجساماً أو وجوهاً جديدة.',
    'imageAi.outpaint.warningLargeExpansion': 'الجودة تقل مع التوسعة الكبيرة',
    'imageAi.outpaint.aspectRatio': 'نسبة الأبعاد',
    'imageAi.outpaint.aspect.free': 'حر',
    'imageAi.outpaint.aspect.1_1': '1:1 مربع',
    'imageAi.outpaint.aspect.4_5': '4:5 بورتريه',
    'imageAi.outpaint.aspect.9_16': '9:16 ستوري',
    'imageAi.outpaint.aspect.16_9': '16:9 شاشة عريضة',
    'imageAi.outpaint.aspect.3_4': '3:4 عمودي',
    'imageAi.outpaint.fastPreview': 'سريع (جودة أقل)',
    'imageAi.outpaint.aiEnhance': 'تحسين بالذكاء الاصطناعي المحلي',
    'imageAi.outpaint.apply': 'تطبيق النتيجة',
    'imageAi.outpaint.reset': 'إعادة ضبط الإطار',
    'imageAi.outpaint.step': 'خطوة',
    'imageAi.outpaint.of': 'من',
    'imageAi.outpaint.export': 'تصدير الصورة الموسعة',
    'imageAi.outpaint.guideGrid': 'شبكة إرشاد',
    'imageAi.badge.ready': 'جاهز محلياً',
    'imageAi.badge.needsDownload': 'يتطلب تنزيل'
  },
  en: {
    'imageAi.tools.removeBg.title': 'Background Removal',
    'imageAi.tools.removeBg.desc': 'Full-res background removal with guided filter',
    'imageAi.tools.inpaint.title': 'Object Removal',
    'imageAi.tools.inpaint.desc': 'Remove unwanted objects with native resolution inpainting',
    'imageAi.tools.outpaint.title': 'Expand Image',
    'imageAi.tools.outpaint.desc': 'Expand canvas boundaries locally without internet',
    'imageAi.outpaint.disclaimer': 'Expands simple backgrounds (sky, grass, walls, textures). Does not draw new objects or faces.',
    'imageAi.outpaint.warningLargeExpansion': 'Quality decreases with large expansion',
    'imageAi.outpaint.aspectRatio': 'Aspect Ratio',
    'imageAi.outpaint.aspect.free': 'Free',
    'imageAi.outpaint.aspect.1_1': '1:1 Square',
    'imageAi.outpaint.aspect.4_5': '4:5 Portrait',
    'imageAi.outpaint.aspect.9_16': '9:16 Story',
    'imageAi.outpaint.aspect.16_9': '16:9 Widescreen',
    'imageAi.outpaint.aspect.3_4': '3:4 Vertical',
    'imageAi.outpaint.fastPreview': 'Fast (Lower Quality)',
    'imageAi.outpaint.aiEnhance': 'Enhance with Local AI',
    'imageAi.outpaint.apply': 'Apply Result',
    'imageAi.outpaint.reset': 'Reset Frame',
    'imageAi.outpaint.step': 'Step',
    'imageAi.outpaint.of': 'of',
    'imageAi.outpaint.export': 'Export Expanded Image',
    'imageAi.outpaint.guideGrid': 'Guide Grid',
    'imageAi.badge.ready': 'Ready Locally',
    'imageAi.badge.needsDownload': 'Needs Download'
  }
};

let currentLang: 'ar' | 'en' = 'ar';

export function setLanguage(lang: 'ar' | 'en') {
  currentLang = lang;
}

export function getLanguage(): 'ar' | 'en' {
  return currentLang;
}

export function t(key: string, lang = currentLang): string {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.ar;
  return dict[key] || key;
}
