import { useState, useEffect } from "react";
import { User, Globe, Moon, Sun, Monitor, LogOut, Info, Bell, BellOff, HardDrive, Trash2, Shield, Volume2, VolumeX, Smartphone, Download, RefreshCw, CheckCircle2 } from "lucide-react";
import { VireonLogo } from "@/components/VireonLogo";
import { t, setLang as applyLang } from "@/lib/i18n";
import { isSfxEnabled, setSfxEnabled, playSfx } from "@/lib/soundFx";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

interface SettingsScreenProps {
  session: any;
  isGuest: boolean;
  onLogout: () => void;
}

import { applyThemeToDOM } from "@/lib/theme";

const SettingsScreen = ({ session, isGuest, onLogout }: SettingsScreenProps) => {
  const { installed, install, isNative } = useInstallPrompt();
  const [theme, setTheme] = useState<"dark" | "light" | "auto">(() => (localStorage.getItem("vireon:theme") as any) || "dark");
  const [lang, setLangState] = useState<"ar" | "en">(() => (localStorage.getItem("vireon:lang") as any) || "ar");
  const [notifications, setNotifications] = useState(() => localStorage.getItem("vireon:notifications") !== "0");
  const [sound, setSound] = useState(() => isSfxEnabled());
  const [storageUsed, setStorageUsed] = useState("...");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((est) => {
        if (!mounted) return;
        const usedMB = ((est.usage || 0) / 1024 / 1024).toFixed(1);
        const totalMB = ((est.quota || 0) / 1024 / 1024).toFixed(0);
        setStorageUsed(`${usedMB} MB / ${totalMB} MB`);
      });
    }
    return () => { mounted = false; };
  }, []);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
        }
      }
      await new Promise((r) => setTimeout(r, 600));
      setUpdateStatus(lang === "en" ? "App is up to date!" : "التطبيق بنسخته الأحدث!");
    } catch {
      setUpdateStatus(lang === "en" ? "Check completed" : "تم الفحص بنجاح");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleTheme = (th: "dark" | "light" | "auto") => { setTheme(th); localStorage.setItem("vireon:theme", th); applyThemeToDOM(th); };
  const handleLang = (l: "ar" | "en") => { setLangState(l); applyLang(l); };
  const handleSound = () => { const next = !sound; setSound(next); setSfxEnabled(next); if (next) playSfx("pop"); };
  const handleNotifications = () => { const next = !notifications; setNotifications(next); localStorage.setItem("vireon:notifications", next ? "1" : "0"); if (next && "Notification" in window) Notification.requestPermission(); };
  const handleClearCache = async () => { try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); localStorage.removeItem("vireon:projects"); localStorage.removeItem("vireon:trash"); setStorageUsed("0 MB"); } catch {} };

  const userEmail = session?.user?.email;
  const userAvatar = session?.user?.user_metadata?.avatar_url;
  const userName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name;

  return (
    <div className="min-h-screen pb-24 px-4 pt-6">
      <h1 className="font-heading text-2xl font-bold text-foreground mb-6">{t("settings.title")}</h1>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          {userAvatar ? <img src={userAvatar} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-primary" />
            : <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center border-2 border-border"><User className="w-7 h-7 text-muted-foreground" /></div>}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{isGuest ? t("settings.guest") : userName || userEmail || "User"}</p>
            {userEmail && <p className="text-[11px] text-muted-foreground truncate">{userEmail}</p>}
            {isGuest && <p className="text-[11px] text-muted-foreground">{t("settings.guestNote")}</p>}
          </div>
          <Shield className="w-5 h-5 text-primary" />
        </div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <p className="text-sm font-bold text-foreground mb-1">{t("settings.theme")}</p>
        <p className="text-[10px] text-muted-foreground mb-3">{t("settings.themeNote")}</p>
        <div className="flex gap-2">
          {[{ id: "dark" as const, icon: Moon, label: t("settings.dark") }, { id: "light" as const, icon: Sun, label: t("settings.light") }, { id: "auto" as const, icon: Monitor, label: t("settings.auto") }].map((th) => (
            <button key={th.id} onClick={() => handleTheme(th.id)}
              className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all ${theme === th.id ? "bg-primary/15 text-primary border border-primary/30" : "bg-secondary text-muted-foreground border border-transparent"}`}>
              <th.icon className="w-5 h-5" /><span className="text-[10px] font-bold">{th.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3"><Globe className="w-4 h-4 text-primary" /><p className="text-sm font-bold text-foreground">{t("settings.language")}</p></div>
        <div className="flex gap-2">
          {[{ id: "ar" as const, label: "العربية" }, { id: "en" as const, label: "English" }].map((l) => (
            <button key={l.id} onClick={() => handleLang(l.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${lang === l.id ? "bg-primary/15 text-primary border border-primary/30" : "bg-secondary text-muted-foreground border border-transparent"}`}>{l.label}</button>
          ))}
        </div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <button onClick={handleNotifications} className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">{notifications ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}<p className="text-sm font-bold text-foreground">{t("settings.notifications")}</p></div>
          <div className={`w-10 h-6 rounded-full transition-all flex items-center px-0.5 ${notifications ? "bg-primary" : "bg-secondary"}`}><div className={`w-5 h-5 rounded-full bg-card shadow transition-transform ${notifications ? "translate-x-4" : "translate-x-0"}`} /></div>
        </button>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <button onClick={handleSound} className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">{sound ? <Volume2 className="w-4 h-4 text-primary" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
            <div className="text-start"><p className="text-sm font-bold text-foreground">{t("settings.sound")}</p><p className="text-[10px] text-muted-foreground">{t("settings.soundNote")}</p></div>
          </div>
          <div className={`w-10 h-6 rounded-full transition-all flex items-center px-0.5 ${sound ? "bg-primary" : "bg-secondary"}`}><div className={`w-5 h-5 rounded-full bg-card shadow transition-transform ${sound ? "translate-x-4" : "translate-x-0"}`} /></div>
        </button>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><HardDrive className="w-4 h-4 text-primary" /><p className="text-sm font-bold text-foreground">{t("settings.storage")}</p></div><span className="text-[10px] text-muted-foreground">{storageUsed}</span></div>
        <button onClick={handleClearCache} className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-bold"><Trash2 className="w-3.5 h-3.5" />{t("settings.clearCache")}</button>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <button
          onClick={async () => {
            if (isNative) return;
            const ok = await install();
            if (!ok) {
              window.dispatchEvent(new Event("vireon_open_install_prompt"));
            }
          }}
          className="w-full flex items-center justify-between group"
        >
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-4 h-4 text-primary shrink-0" />
            <div className="text-start">
              <p className="text-sm font-bold text-foreground">
                {isNative
                  ? (lang === "en" ? "Native Android App" : "تطبيق أندرويد الرسمي")
                  : (lang === "en" ? "Install App (PWA)" : "تثبيت التطبيق على الجوال")}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {isNative
                  ? (lang === "en" ? "Running natively with full device access" : "تعمل الآن بالنسخة الأصلية مع وصول كامل للميزات")
                  : installed
                  ? (lang === "en" ? "App installed & ready" : "التطبيق مثبت ومتاح على الشاشة الرئيسية")
                  : (lang === "en" ? "Add to home screen for fast access" : "إضافة للشاشة الرئيسية للتثبيت المباشر")}
              </p>
            </div>
          </div>
          {!isNative && (
            <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl gradient-primary text-primary-foreground text-xs font-bold shadow-sm group-active:scale-95 transition-transform shrink-0">
              <Download className="w-3.5 h-3.5" />
              {installed ? (lang === "en" ? "Open" : "عرض") : (lang === "en" ? "Install" : "تثبيت")}
            </span>
          )}
        </button>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <RefreshCw className={`w-4 h-4 text-primary ${checkingUpdate ? "animate-spin" : ""}`} />
            <div className="text-start">
              <p className="text-sm font-bold text-foreground">
                {lang === "en" ? "Check for Updates" : "التحقق من التحديثات"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {updateStatus || (lang === "en" ? "Ensure you have the latest software features" : "تأكد من حصولك على أحدث الميزات والإصلاحات")}
              </p>
            </div>
          </div>
          <button
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold transition-all disabled:opacity-50"
          >
            {checkingUpdate ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : updateStatus ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-primary" />
            )}
            <span>{checkingUpdate ? (lang === "en" ? "Checking..." : "جاري...") : (lang === "en" ? "Check" : "فحص")}</span>
          </button>
        </div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-3"><VireonLogo className="w-8 h-8" /><div className="flex-1"><p className="text-sm font-bold text-foreground">Vireon AI</p><p className="text-[10px] text-muted-foreground">v1.0.0</p></div><Info className="w-4 h-4 text-muted-foreground" /></div>
      </div>
      <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive/10 text-destructive font-bold text-sm hover:bg-destructive/20 transition-all"><LogOut className="w-4 h-4" />{isGuest ? t("settings.guestLogout") : t("settings.logout")}</button>
    </div>
  );
};
export default SettingsScreen;
