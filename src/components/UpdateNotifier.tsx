import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Sparkles, RefreshCw, X, Download, Package } from "lucide-react";
import { addDynamicNotification } from "@/lib/notifications";
import { t, getLang, isRTL } from "@/lib/i18n";
import { useOTAUpdate } from "@/hooks/useOTAUpdate";

const UpdateNotifier = () => {
  const [hasWebUpdate, setHasWebUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const ota = useOTAUpdate();

  const isNative = Capacitor.isNativePlatform();
  const ar = getLang() === "ar";

  useEffect(() => {
    const isDev = Boolean(import.meta.env.DEV);

    // Only check Web updates in production web environments
    if (isDev || isNative) return;
    
    const checkUpdate = async () => {
      try {
        // Force service worker update check if available
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            await registration.update();
          }
        }

        const currentScripts = Array.from(document.querySelectorAll("script"))
          .map((s) => s.getAttribute("src"))
          .filter(Boolean) as string[];
        const currentLinks = Array.from(document.querySelectorAll("link"))
          .map((l) => l.getAttribute("href"))
          .filter(Boolean) as string[];
        
        const currentAssets = [...currentScripts, ...currentLinks];
        const isAsset = (url: string) => url.includes("/assets/") && (url.endsWith(".js") || url.endsWith(".css"));
        const localAssets = currentAssets.filter(isAsset);

        if (localAssets.length === 0) return;

        const res = await fetch(`${window.location.origin}/index.html?cb=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
        });
        if (!res.ok) return;
        const html = await res.text();

        const scriptRegex = /<script\b[^>]*\bsrc="([^"]+)"/gi;
        const linkRegex = /<link\b[^>]*\bhref="([^"]+)"/gi;
        
        const freshAssets: string[] = [];
        let match;
        while ((match = scriptRegex.exec(html)) !== null) {
          if (isAsset(match[1])) freshAssets.push(match[1]);
        }
        while ((match = linkRegex.exec(html)) !== null) {
          if (isAsset(match[1])) freshAssets.push(match[1]);
        }

        if (freshAssets.length === 0) return;

        const hasNewAssets = freshAssets.some((asset) => !localAssets.includes(asset));

        if (hasNewAssets) {
          setHasWebUpdate(true);
          
          addDynamicNotification({
            id: `update-vireon-${freshAssets.join("-").slice(-20)}`,
            title: ar ? "تحديث جديد متوفر للتطبيق ⬥" : "New App Update Available ⬥",
            body: ar 
              ? "لقد قمنا بنشر تحديث جديد لتطبيق Vireon AI Studio يتضمن تحسينات وميزات إضافية. اضغط هنا للتحديث فوراً." 
              : "We have published a new update for Vireon AI Studio with improvements and new features. Click to update now.",
            date: new Date().toISOString().split("T")[0],
            emoji: "🔄",
            tag: "تحديث"
          });
        }
      } catch (error) {
        console.log("Unable to check for app updates:", error);
      }
    };

    checkUpdate();
    const interval = setInterval(checkUpdate, 60000);
    window.addEventListener("focus", checkUpdate);

    const handleControllerChange = () => {
      setHasWebUpdate(true);
    };

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkUpdate);
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      }
    };
  }, [isNative, ar]);

  // Handle OTA update check for Native platforms
  useEffect(() => {
    if (!isNative) return;

    // Check for OTA update after a short delay to not block startup animations
    const timer = setTimeout(() => {
      ota.checkForUpdate();
    }, 5000);

    return () => clearTimeout(timer);
  }, [isNative]);

  const handleWebUpdate = () => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister().catch(() => {}));
      });
    }

    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => caches.delete(key));
      });
    }

    window.location.reload();
  };

  const handleOTADownload = () => {
    ota.downloadUpdate();
  };

  const handleOTAApply = () => {
    ota.applyUpdate();
  };

  const shouldShow = (hasWebUpdate || ota.status !== "idle" && ota.status !== "no-update" && ota.status !== "checking") && !dismissed;

  if (!shouldShow) return null;

  return (
    <div 
      className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-[110] animate-in slide-in-from-bottom duration-300"
      dir={isRTL() ? "rtl" : "ltr"}
    >
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-zinc-950/95 p-4 text-white shadow-2xl shadow-emerald-500/10 backdrop-blur-md">
        {/* Glow decoration */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            {ota.status === "downloading" ? (
              <Download className="w-5 h-5 animate-pulse" />
            ) : (
              <RefreshCw className="w-5 h-5 animate-spin-slow" />
            )}
          </div>
          
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="font-heading font-bold text-sm text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              {isNative ? (
                ar ? "تحديث متاح للنظام" : "System Update Available"
              ) : (
                ar ? "تحديث جديد متوفر للتطبيق!" : "New App Update Available!"
              )}
            </h3>

            <p className="mt-1 text-xs text-zinc-300 leading-relaxed">
              {ota.status === "update-available" ? (
                ar ? `إصدار جديد (${ota.version}) جاهز للتحميل.` : `New version (${ota.version}) is ready to download.`
              ) : ota.status === "downloading" ? (
                ar ? `جاري تحميل التحديث... ${Math.round(ota.progress)}%` : `Downloading update... ${Math.round(ota.progress)}%`
              ) : ota.status === "ready-to-install" ? (
                ar ? "اكتمل التحميل. أعد التشغيل لتطبيق التغييرات." : "Download complete. Restart to apply changes."
              ) : (
                ar
                  ? "يتوفر إصدار جديد يحتوي على ميزات وإصلاحات جديدة. حدّث الآن للاستفادة منها."
                  : "A brand new version with exciting updates is ready. Refresh now to apply."
              )}
            </p>
            
            <div className="mt-3 flex items-center gap-2">
              {isNative ? (
                <>
                  {ota.status === "update-available" && (
                    <button
                      onClick={handleOTADownload}
                      className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-xs font-bold text-zinc-950 transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {ar ? "تحميل الآن" : "Download Now"}
                    </button>
                  )}

                  {ota.status === "ready-to-install" && (
                    <button
                      onClick={handleOTAApply}
                      className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-xs font-bold text-zinc-950 transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
                    >
                      <Package className="w-3.5 h-3.5" />
                      {ar ? "تطبيق وإعادة تشغيل" : "Apply & Restart"}
                    </button>
                  )}

                  {ota.status === "downloading" && (
                    <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-2">
                      <div
                        className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${ota.progress}%` }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <button
                  onClick={handleWebUpdate}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-xs font-bold text-zinc-950 transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {ar ? "تحديث الآن" : "Update Now"}
                </button>
              )}
              
              {(ota.status === "update-available" || !isNative) && (
                <button
                  onClick={() => setDismissed(true)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 transition-colors"
                >
                  {ar ? "لاحقاً" : "Later"}
                </button>
              )}
            </div>
          </div>

          <button
            onClick={() => setDismissed(true)}
            className="absolute top-3 left-3 w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateNotifier;
