import { useEffect, useState } from "react";
import { Download, X, Share, Plus, Sparkles, MoreVertical, Smartphone, ExternalLink, CheckCircle2 } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { t, getLang } from "@/lib/i18n";
import { VireonLogo } from "@/components/VireonLogo";

const DISMISS_KEY = "vireon:installDismissedAt";
const DISMISS_DAYS = 3;

export const InstallPrompt = () => {
  const { install, isIOS, canInstall, installed, isNative } = useInstallPrompt();
  const [open, setOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);
  const en = getLang() === "en";

  useEffect(() => {
    const iframeCheck = typeof window !== "undefined" && window.self !== window.top;
    setIsInIframe(iframeCheck);

    const handleOpen = () => {
      setManualOpen(true);
      setOpen(true);
    };
    window.addEventListener("vireon_open_install_prompt", handleOpen);

    if (isNative) {
      return () => window.removeEventListener("vireon_open_install_prompt", handleOpen);
    }

    if (installed && !manualOpen) {
      return () => window.removeEventListener("vireon_open_install_prompt", handleOpen);
    }

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed && !manualOpen) {
      const days = (Date.now() - Number(dismissed)) / (1000 * 60 * 60 * 24);
      if (days < DISMISS_DAYS) {
        return () => window.removeEventListener("vireon_open_install_prompt", handleOpen);
      }
    }

    const tmr = setTimeout(() => setOpen(true), 2500);
    return () => {
      clearTimeout(tmr);
      window.removeEventListener("vireon_open_install_prompt", handleOpen);
    };
  }, [installed, isNative, manualOpen]);

  const close = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setOpen(false);
    setManualOpen(false);
    setShowGuide(false);
  };

  const handleInstallClick = async () => {
    if (isInIframe) {
      // Open in a new top-level browser tab so browser enables PWA installation
      window.open(window.location.href, "_blank");
      return;
    }

    if (canInstall) {
      const ok = await install();
      if (ok) {
        setOpen(false);
        setManualOpen(false);
      } else {
        setShowGuide(true);
      }
    } else {
      setShowGuide(true);
    }
  };

  if (!open || isNative || (installed && !manualOpen)) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" dir={en ? "ltr" : "rtl"}>
      <div className="relative w-full max-w-sm rounded-3xl border border-primary/30 bg-card/95 p-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        <button
          onClick={close}
          aria-label="close"
          className="absolute top-4 left-4 w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          {/* App Icon Cover Logo */}
          <div className="relative mb-4 group">
            <div className="absolute -inset-1 rounded-3xl gradient-primary blur-xl opacity-70 group-hover:opacity-90 transition-opacity" />
            <div className="relative w-20 h-20 rounded-2xl bg-slate-950 p-2 border border-primary/40 shadow-2xl flex items-center justify-center overflow-hidden">
              <VireonLogo className="w-full h-full" />
            </div>
          </div>

          <h2 className="font-heading text-xl font-bold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            {isIOS
              ? (en ? "Add Vireon AI Studio to Home Screen" : "تثبيت Vireon AI Studio على الشاشة الرئيسية")
              : (en ? "Install Vireon AI Studio App" : "تثبيت تطبيق Vireon AI Studio")}
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed px-1">
            {en
              ? "Install the app for faster performance, full offline access, and full-screen video editing."
              : "ثبّت التطبيق على جوالك أو جهازك للوصول السريع، العمل بدون إنترنت، وتحرير الفيديو بملء الشاشة."}
          </p>

          {/* If inside iframe, show explicit New Window tab notice */}
          {isInIframe && (
            <div className="mt-4 w-full rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3 text-start">
              <p className="text-[11px] font-semibold text-amber-500 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                {en ? "Browser limit in preview window" : "ملاحظة التثبيت في المعاينة"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
                {en
                  ? "Browsers require opening the app in a new tab to enable the 1-click PWA install button."
                  : "تتطلب المتصفحات فتح التطبيق في نافذة مستقلة لتمكين زر التثبيت المباشر بنقرة واحدة."}
              </p>
            </div>
          )}

          {isIOS ? (
            <div className="mt-5 w-full space-y-2.5 text-start">
              <div className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-3 border border-border/50">
                <Share className="w-5 h-5 text-primary shrink-0" />
                <span className="text-xs text-foreground font-medium">
                  {en ? "1. Tap the Share button in Safari" : "1. اضغط على زر المشاركة (Share) في أسفل متصفح Safari"}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-3 border border-border/50">
                <Plus className="w-5 h-5 text-primary shrink-0" />
                <span className="text-xs text-foreground font-medium">
                  {en ? "2. Select 'Add to Home Screen'" : "2. اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen)"}
                </span>
              </div>
              <button
                onClick={close}
                className="mt-2 w-full rounded-2xl bg-secondary py-3 text-xs font-bold text-foreground hover:bg-secondary/80 transition-all"
              >
                {t("install.later")}
              </button>
            </div>
          ) : showGuide ? (
            <div className="mt-5 w-full space-y-2.5 text-start animate-in fade-in duration-200">
              <div className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-3 border border-border/50">
                <MoreVertical className="w-5 h-5 text-primary shrink-0" />
                <span className="text-xs text-foreground font-medium">
                  {en ? "1. Open browser menu (⋮ upper right)" : "1. افتح قائمة خيارات المتصفح (أعلى اليسار/اليمين ⋮)"}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-3 border border-border/50">
                <Smartphone className="w-5 h-5 text-primary shrink-0" />
                <span className="text-xs text-foreground font-medium">
                  {en ? "2. Tap 'Install App' or 'Add to Home screen' (Create shortcut)" : "2. اضغط «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» (إنشاء اختصار)"}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-primary/10 p-3 border border-primary/20">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-[11px] text-foreground font-medium">
                  {en ? "3. The app will be added to your home screen with high performance & full screen mode." : "3. سيظهر تطبيق Vireon AI على شاشة جوالك كتطبيق مستقل بملء الشاشة وبسرعة عالية."}
                </span>
              </div>
              <button
                onClick={close}
                className="mt-2 w-full rounded-2xl bg-secondary py-3 text-xs font-bold text-foreground hover:bg-secondary/80 transition-all"
              >
                {en ? "Got it" : "حسناً، فهمت"}
              </button>
            </div>
          ) : (
            <div className="mt-5 w-full space-y-2">
              <button
                onClick={handleInstallClick}
                className="w-full rounded-2xl gradient-primary glow-primary-sm py-3.5 text-xs font-bold text-primary-foreground flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all shadow-lg"
              >
                {isInIframe ? (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    {en ? "Open in New Window to Install" : "فتح في نافذة مستقلة للتثبيت المباشر"}
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    {canInstall
                      ? (en ? "Install App Now" : "تثبيت التطبيق الآن")
                      : (en ? "Show Install Instructions" : "عرض طريقة التثبيت")}
                  </>
                )}
              </button>
              <button
                onClick={close}
                className="w-full rounded-2xl bg-secondary/80 py-3 text-xs font-bold text-foreground hover:bg-secondary transition-all"
              >
                {t("install.later")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;
