# Vireon AI - دليل التطوير والنشر

## نظرة عامة على التحديثات

تم تحديث مشروع Vireon AI ليصبح **تطبيق متكامل احترافي** مع دعم كامل للتصدير المتقدم والعمل كتطبيق أصلي على الهواتف الذكية.

## التحديثات الرئيسية

### 1. إصلاح تصدير الكابشن (Caption Export Fix) ✅
**المشكلة السابقة:** الكابشن في المعاينة تدعم التدوير والتحجيم والقلب، لكن في التصدير كانت تظهر فقط في المنتصف بدون هذه المؤثرات.

**الحل المطبق:**
- تم تحديث `ExportDialog.tsx` لدعم جميع خصائص الكابشن:
  - `xPercent` و `yPercent`: الموقع الدقيق للكابشن
  - `rotation`: زاوية التدوير
  - `scale`: حجم الكابشن
  - `flipH` و `flipV`: القلب الأفقي والعمودي
- تم استخدام `ctx.translate()` و `ctx.rotate()` و `ctx.scale()` لتطبيق التحويلات بشكل صحيح

**الملف المعدل:**
```
src/components/editor/ExportDialog.tsx (السطور 770-810)
```

### 2. نظام التصدير المتقدم (Advanced Export Engine) ✅
تم إضافة محرك تصدير متقدم باستخدام **FFmpeg.wasm** للحصول على جودة عالية وتصدير احترافي:

**الملفات الجديدة:**
- `src/lib/advancedExportEngine.ts`: محرك التصدير الرئيسي
- `src/components/editor/ExportProgressDialog.tsx`: واجهة عرض التقدم

**الميزات:**
- تحويل الفيديو بجودات مختلفة (4K, 2K, 1080p, 720p, 480p)
- دعم صيغ متعددة (MP4, WebM, MOV)
- عرض تقدم التصدير في الوقت الفعلي
- معالجة الأخطاء والاسترجاع التلقائي

### 3. تحسينات PWA (Progressive Web App) ✅
تم تفعيل وتحسين إعدادات PWA الكاملة في `vite.config.ts`:

**الميزات:**
- تثبيت التطبيق على الشاشة الرئيسية
- العمل بدون اتصال بالإنترنت (Offline-First)
- تحديث تلقائي للإصدارات الجديدة
- تخزين مؤقت ذكي للموارد والخطوط
- دعم الشاشات المختلفة (Responsive)

**الملف المعدل:**
```
vite.config.ts (السطور 19-101)
```

### 4. دعم Capacitor للتطبيقات الأصلية ✅
تم إضافة ملف تكوين Capacitor لتحويل التطبيق إلى تطبيق أصلي:

**الملف الجديد:**
```
capacitor.config.ts
```

**الدعم:**
- تطبيق Android أصلي
- تطبيق iOS أصلي
- الوصول إلى ميزات النظام (الكاميرا، المعرض، إلخ)

## كيفية البناء والنشر

### البناء للويب
```bash
npm run build
```

### البناء للتطبيقات الأصلية (Android/iOS)

#### الخطوة 1: تثبيت Capacitor
```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios
```

#### الخطوة 2: بناء التطبيق
```bash
npm run build
npx cap add android
npx cap add ios
npx cap sync
```

#### الخطوة 3: فتح في Android Studio أو Xcode
```bash
# للأندرويد
npx cap open android

# لـ iOS
npx cap open ios
```

## ملفات التكوين الجديدة

### vite.config.ts
- تفعيل VitePWA مع إعدادات متقدمة
- تخزين مؤقت ذكي للموارد
- دعم التحديث التلقائي

### capacitor.config.ts
- تكوين معرّف التطبيق
- إعدادات الخادم
- إعدادات الحالة والشاشة الافتتاحية

## الملفات المعدلة

### src/components/editor/ExportDialog.tsx
- إضافة دعم كامل لخصائص الكابشن في التصدير
- إضافة زر التصدير المتقدم (FFmpeg)
- تحسين واجهة المستخدم

## الملفات الجديدة

### src/lib/advancedExportEngine.ts
محرك تصدير متقدم يوفر:
- تحميل FFmpeg.wasm من CDN
- تحويل الفيديو بجودات متعددة
- معالجة الأخطاء الشاملة
- تتبع التقدم

### src/components/editor/ExportProgressDialog.tsx
واجهة عرض تقدم التصدير مع:
- شريط تقدم مرئي
- رسائل حالة مفصلة
- مؤشرات المراحل
- أزرار التحكم

## متطلبات النظام

### للتطوير
- Node.js 16+
- npm 8+
- Java 11+ (لـ Android)
- Xcode 12+ (لـ iOS)

### للتشغيل
- متصفح حديث يدعم:
  - Web Workers
  - Service Workers
  - WebAssembly
  - Canvas API

## الخطوات التالية

1. **اختبار التصدير:** تأكد من أن الكابشن تظهر بشكل صحيح في الفيديو المُصدَّر
2. **تحسين الأداء:** قم بتحسين سرعة التصدير باستخدام Web Workers
3. **إضافة المزيد من الصيغ:** دعم صيغ إضافية مثل GIF و WebP
4. **نشر التطبيق:** نشر على Google Play و App Store

## الدعم والمساعدة

للمزيد من المعلومات:
- [Capacitor Documentation](https://capacitorjs.com/)
- [Vite PWA Plugin](https://vite-pwa-org.netlify.app/)
- [FFmpeg.wasm](https://ffmpegwasm.netlify.app/)

---

**آخر تحديث:** يوليو 2026
**الإصدار:** 2.0.0
