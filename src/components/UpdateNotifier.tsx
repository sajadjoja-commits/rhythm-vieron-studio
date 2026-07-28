import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, X, Bell } from "lucide-react";
import { addDynamicNotification } from "@/lib/notifications";
import { t, getLang, isRTL } from "@/lib/i18n";

const UpdateNotifier = () => {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only check in production or deployed environments
    const isDev = import.meta.env.DEV;
    
    const checkUpdate = async () => {
      if (isDev) return;
      try {
        // Force service worker update check if available
        if ("serviceWorker" in navigator) {
          try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
              await registration.update();
            }
          } catch (swErr) {
            console.warn("Failed to manually check for service worker update:", swErr);
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

        // Fetch index.html with cache-buster
        const res = await fetch(`${window.location.origin}/index.html?cb=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
        });
        if (!res.ok) return;
        const html = await res.text();

        // Extract script and link assets from fetched HTML
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

        // Check if any fresh asset is missing from local loaded assets
        const hasNewAssets = freshAssets.some((asset) => !localAssets.includes(asset));

        if (hasNewAssets) {
          setHasUpdate(true);
          
          // Seed a dynamic notification in the notification bell
          const ar = getLang() === "ar";
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

    if (isDev) return;

    // Check immediately on mount, then every 45 seconds
    checkUpdate();
    const interval = setInterval(checkUpdate, 45000);

    // Also check when the page gains focus (user switches back to the app tab)
    window.addEventListener("focus", checkUpdate);

    // Listen for Service Worker updates/controller changes
    const handleControllerChange = () => {
      console.log("Service Worker controller changed. New version detected!");
      setHasUpdate(true);
    };

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      try {
        navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
      } catch (e) {}
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkUpdate);
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        try {
          navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
        } catch (e) {}
      }
    };
  }, []);

  const handleUpdate = () => {
    // Unregister any active service worker to force fresh load
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      try {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => {
            try { reg.unregister().catch(() => {}); } catch {}
          });
        }).catch(() => {});
      } catch (e) {}
    }

    // Clear caches
    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => caches.delete(key));
      });
    }

    // Force reload with cache bypass
    window.location.reload();
  };

  if (!hasUpdate || dismissed) return null;

  const ar = getLang() === "ar";

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
            <RefreshCw className="w-5 h-5 animate-spin-slow" />
          </div>
          
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="font-heading font-bold text-sm text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              {ar ? "تحديث جديد متوفر للتطبيق!" : "New App Update Available!"}
            </h3>
            <p className="mt-1 text-xs text-zinc-300 leading-relaxed">
              {ar 
                ? "يتوفر إصدار جديد يحتوي على ميزات وإصلاحات جديدة. حدّث الآن للاستفادة منها." 
                : "A brand new version with exciting updates is ready. Refresh now to apply."}
            </p>
            
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleUpdate}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-xs font-bold text-zinc-950 transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {ar ? "تحديث الآن" : "Update Now"}
              </button>
              
              <button
                onClick={() => setDismissed(true)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 transition-colors"
              >
                {ar ? "لاحقاً" : "Later"}
              </button>
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
