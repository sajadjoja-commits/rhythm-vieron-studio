import { ModelManifest, ENABLE_RMBG, RMBG2_MANIFEST } from './rmbg2.manifest';

/**
 * Segmentation Model Catalog
 *
 * Complies with requirement (2):
 * - MediaPipe Selfie Segmenter (Fast path for humans / portraits <= 1s, Apache-2.0)
 * - MediaPipe Interactive Magic Touch (Official Google storage for tap-to-select object, Apache-2.0)
 * - U²-Netp (Apache-2.0, 4.57 MB, official author Qin et al. University of Alberta)
 * - Evaluated models (IS-Net, BiRefNet-lite, U²-Net full):
 *   Models without direct verifiable author-signed Web-ONNX / SHA-256 are set to enabled: false.
 */

export const MODEL_CATALOG: Record<string, ModelManifest> = {
  'mediapipe-selfie': {
    id: 'mediapipe-selfie',
    name: 'MediaPipe Selfie Segmenter',
    description: 'مسار فائق السرعة مخصص لصور الأشخاص والبورتريه (≤ 1 ثانية)',
    license: 'Apache License 2.0',
    licenseType: 'Commercial-Friendly',
    sizeBytes: 249537,
    sizeFormatted: '249,537 bytes',
    inputResolution: [256, 256],
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
    sha256: '191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b',
    enabled: true,
    notes: 'رسمي من Google عبر CDN المعتمد - مسار سريع للأشخاص'
  },
  'mediapipe-magic-touch': {
    id: 'mediapipe-magic-touch',
    name: 'MediaPipe Interactive (Magic Touch)',
    description: 'عزل كائن محدد بالنقر واللمس التفاعلي',
    license: 'Apache License 2.0',
    licenseType: 'Commercial-Friendly',
    sizeBytes: 6227884,
    sizeFormatted: '6,227,884 bytes',
    inputResolution: [512, 512],
    url: 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite',
    sha256: 'e24338a717c1b7ad8d159666677ef400babb7f33b8ad60c4d96db4ecf694cd25',
    enabled: true,
    notes: 'رسمي من Google لتقسيم الكائنات بالنقر'
  },
  'u2netp-general': {
    id: 'u2netp-general',
    name: 'U²-Netp (General Object Segmentation)',
    description: 'نموذج تقسيم عام خفيف جداً للأشياء والمنتجات والحيوانات (النسخة المحمولة)',
    license: 'Apache License 2.0',
    licenseType: 'Commercial-Friendly',
    sizeBytes: 4574861,
    sizeFormatted: '4,574,861 bytes',
    inputResolution: [320, 320],
    // Official author repository: Xuebin Qin et al. (GitHub: xuebinqin/U-2-Net)
    // Quantized / ONNX portable weight
    url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',
    sha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
    enabled: true,
    notes: 'ONNX منشور في إصدار rembg ومصدره نموذج U²-Netp للمؤلفين؛ ترخيص أوزان U-2-Net الرسمي Apache 2.0.'
  },
  'isnet-general': {
    id: 'isnet-general',
    name: 'IS-Net (DIS5K General Use)',
    description: 'نموذج تقسيم عالي الدقة (DIS5K) للأجسام الدقيقة',
    license: 'MIT License',
    licenseType: 'Commercial-Friendly',
    sizeBytes: 176 * 1024 * 1024,
    sizeFormatted: '~176 MB (يتجاوز هدف ≤ 50MB)',
    inputResolution: [1024, 1024],
    url: '',
    sha256: '',
    enabled: false,
    notes: 'معطّل: يتجاوز هدف الحجم (176MB) والمؤلفون نشروا أوزان PyTorch فقط بدون ONNX رسمي موثق بهاش معتمد'
  },
  'birefnet-lite': {
    id: 'birefnet-lite',
    name: 'BiRefNet-lite',
    description: 'Bilateral Reference Network for High-Resolution Dichotomous Image Segmentation',
    license: 'Apache License 2.0',
    licenseType: 'Commercial-Friendly',
    sizeBytes: 82 * 1024 * 1024,
    sizeFormatted: '~82 MB',
    inputResolution: [512, 512],
    url: '',
    sha256: '',
    enabled: false,
    notes: 'معطّل: مستودعات مجتمعية غير رسمية تفتقر لهاش موثق من المؤلف الأصلي مباشرة'
  },
  'u2net-full': {
    id: 'u2net-full',
    name: 'U²-Net (Full Original)',
    description: 'النسخة الكاملة من U²-Net',
    license: 'Apache License 2.0',
    licenseType: 'Commercial-Friendly',
    sizeBytes: 176 * 1024 * 1024,
    sizeFormatted: '176 MB',
    inputResolution: [320, 320],
    url: '',
    sha256: '',
    enabled: false,
    notes: 'معطّل: يتجاوز حد الحجم المستهدف ≤ 50MB (بديله U²-Netp مفعل)'
  },
  'migan-512': {
    id: 'migan-512',
    name: 'MI-GAN 512 (Places2)',
    description: 'نموذج إزالة العناصر وترميم الصور عالي الدقة الرسمي (Picsart-AI-Research/MI-GAN)',
    license: 'MIT License (model weights)',
    licenseType: 'Commercial-Friendly',
    sizeBytes: 28079181,
    sizeFormatted: '28,079,181 bytes',
    inputResolution: [512, 512],
    url: 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx',
    sha256: '6f1f3530a1a2324b19752018ce756088b07973cda8d7d890034ace5c8a48c40b',
    enabled: true,
    notes: 'ملف ONNX محول من خط MI-GAN 512 Places2؛ رابط التنزيل الرسمي مذكور في README، وترخيص الأوزان MIT.'
  },
  'rmbg-2.0': RMBG2_MANIFEST
};

/**
 * Return only active commercial-friendly models for UI catalog display
 */
export function getActiveModels(): ModelManifest[] {
  return Object.values(MODEL_CATALOG).filter(
    (m) => m.enabled && (m.id !== 'rmbg-2.0' || ENABLE_RMBG)
  );
}

/**
 * Return all evaluated models for the technical evaluation report
 */
export function getAllEvaluatedModels(): ModelManifest[] {
  return Object.values(MODEL_CATALOG);
}
