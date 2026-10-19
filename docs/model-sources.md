# مصادر نماذج الذكاء الاصطناعي

تاريخ التحقق: **2026-10-19**. جرى تنزيل الملفات إلى مجلد مؤقت خارج المستودع، وتسجيل الحجم الفعلي بالبايت وبصمة SHA-256 لمحتوى الملف كما نُزّل. روابط التنزيل النهائية أعادت HTTP `200`.

## سجل النماذج

| النموذج | رابط المصدر المتحقق | HTTP status | الحجم الفعلي | SHA-256 | الترخيص (رابط ملف الترخيص) | تاريخ التحقق | الحالة |
|---|---|---:|---:|---|---|---|---|
| `mediapipe-selfie` | [selfie_segmenter.tflite](https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite) | 200 | 249,537 bytes | `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b` | Apache-2.0؛ [بطاقة النموذج من Google](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf) تصرح بالترخيص، و[MediaPipe LICENSE](https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE). | 2026-10-19 | verified |
| `mediapipe-magic-touch` | [magic_touch.tflite](https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite) | 200 | 6,227,884 bytes | `e24338a717c1b7ad8d159666677ef400babb7f33b8ad60c4d96db4ecf694cd25` | Apache-2.0؛ [بطاقة MagicTouch من Google](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MagicTouch.pdf) تصرح بالترخيص، و[MediaPipe LICENSE](https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE). | 2026-10-19 | verified |
| `u2netp-general` | [u2netp.onnx](https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx) | 200 | 4,574,861 bytes | `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8` | Apache-2.0 لأوزان U²-Net بحسب [LICENSE للمؤلفين](https://raw.githubusercontent.com/xuebinqin/U-2-Net/master/LICENSE). ملف ONNX موزع في إصدار rembg؛ ترخيص أداة rembg منفصل وهو MIT ([LICENSE.txt](https://raw.githubusercontent.com/danielgatis/rembg/main/LICENSE.txt)). | 2026-10-19 | verified |
| `migan-512` | [migan_pipeline_v2.onnx](https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx) | 200 | 28,079,181 bytes | `6f1f3530a1a2324b19752018ce756088b07973cda8d7d890034ace5c8a48c40b` | MIT للأوزان بحسب [MI-GAN LICENSE-WEIGHTS](https://raw.githubusercontent.com/Picsart-AI-Research/MI-GAN/main/LICENSE-WEIGHTS). رابط ONNX وارد في [مستودع MI-GAN الرسمي](https://github.com/Picsart-AI-Research/MI-GAN) والملف مستضاف في [مستودع النموذج على Hugging Face](https://huggingface.co/andraniksargsyan/migan). | 2026-10-19 | verified |

## تحقق سلامة الملفات

- ملفا MediaPipe هما TFLite؛ ظهر معرّف FlatBuffer `TFL3` في البايتات 4–7 من كل ملف.
- نموذجا U²-Netp وMI-GAN حمّلا عبر `onnx.load` واجتازا `onnx.checker.check_model` باستخدام onnx 1.23.2.
- جميع النماذج أصغر من حد 128 MiB، لذا حالة `enabled` هي `true` في `src/ai/models/models.catalog.ts`.
- لم تُضف ملفات أوزان إلى Git؛ تنزيلات التحقق كانت مؤقتة خارج المستودع.

## فحص الروابط القديمة

الرابطان التاليان في الكتالوج قبل التحديث أعادا HTTP `404`، واستُبدلا بالمصادر المتحققة في الجدول:

- `https://storage.googleapis.com/mediapipe-assets/u2netp.onnx` — `404`
- `https://storage.googleapis.com/mediapipe-assets/migan_places2_512.onnx` — `404`

## مراجع Google MediaPipe

- [دليل Image Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter)
- [دليل Interactive Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/interactive_segmenter)
- [بطاقة MediaPipe Selfie Segmentation](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf)
- [بطاقة MediaPipe MagicTouch](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MagicTouch.pdf)
