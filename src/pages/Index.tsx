import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";
import { useMedia } from "@/context/MediaContext";
import { isRTL, t } from "@/lib/i18n";
import { Camera as CameraIcon, ImageIcon, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { applyThemeToDOM } from "@/lib/theme";
import { safeStorage } from "@/lib/safeStorage";
import AuthScreen from "@/components/AuthScreen";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

import HomeScreen from "@/components/HomeScreen";
import TemplatesScreen from "@/components/TemplatesScreen";
import CameraScreen from "@/components/CameraScreen";
import PhotoEditorScreen from "@/components/PhotoEditorScreen";
import ProjectsScreen from "@/components/ProjectsScreen";
import SettingsScreen from "@/components/SettingsScreen";
import EditorScreen from "@/components/EditorScreen";
import TemplateUseScreen from "@/components/TemplateUseScreen";
import SmartTemplateQuickEditor from "@/components/SmartTemplateQuickEditor";
import MusicLibrary from "@/components/MusicLibrary";

const ScreenLoader = () => (
  <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-background text-foreground animate-pulse">
    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
      <Loader2 className="w-5 h-5 text-primary animate-spin" />
    </div>
    <span className="text-xs font-semibold tracking-wider text-muted-foreground">Vireon AI</span>
  </div>
);

const Index = () => {
  const [activeTab, setActiveTab] = useState("home");
  const [showEditor, setShowEditor] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showPhotoEditor, setShowPhotoEditor] = useState(false);
  const [activeTemplateObj, setActiveTemplateObj] = useState<any | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [activeSmartTemplate, setActiveSmartTemplate] = useState<any | null>(null);
  const [showGallery, setShowGallery] = useState<{ open: boolean; type: "image" | "video" | "both" }>({ open: false, type: "both" });
  const [showMusicLibrary, setShowMusicLibrary] = useState(false);
  const [musicTargetTime, setMusicTargetTime] = useState(0);
  const { newProject, addAudioTrack } = useMedia();

  const handleAddMusic = (track: any) => {
    addAudioTrack({
      name: track.title || track.name,
      url: track.url,
      start: musicTargetTime,
      offset: 0,
      duration: 30,
      sourceDuration: 180,
      volume: 0.8,
      muted: false,
      fx: "none",
      color: track.color || "#ec4899",
      kind: "music",
    });
    setShowMusicLibrary(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tplId = params.get("templateId") || params.get("template");
    if (tplId) setActiveTemplateId(tplId);
  }, []);

  const [session, setSession] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isGuest, setIsGuest] = useState(() => safeStorage.getItem("vireon:guest") === "1");
  const [exitOverlay, setExitOverlay] = useState(false);
  const [lastBackClick, setLastBackClick] = useState(0);

  useEffect(() => {
    if (!window.history.state) window.history.replaceState({ isHome: true, tab: "home" }, "");
  }, []);

  useEffect(() => {
    const handleBackAction = () => {
      if (showEditor) {
        setShowEditor(false);
        applyThemeToDOM((safeStorage.getItem("vireon:theme") as "dark" | "light" | "auto") || "dark");
        return;
      }

      if (activeTemplateObj || activeTemplateId) {
        setActiveTemplateObj(null);
        setActiveTemplateId(null);
        const url = new URL(window.location.href);
        url.searchParams.delete("templateId");
        url.searchParams.delete("template");
        window.history.replaceState({}, "", url.toString());
        return;
      }

      if (activeSmartTemplate) {
        setActiveSmartTemplate(null);
        return;
      }

      if (showPhotoEditor) {
        setShowPhotoEditor(false);
        return;
      }

      if (showPlusMenu) {
        setShowPlusMenu(false);
        return;
      }

      if (showGallery.open) {
        setShowGallery({ ...showGallery, open: false });
        return;
      }

      if (showMusicLibrary) {
        setShowMusicLibrary(false);
        return;
      }

      if (activeTab !== "home") {
        setActiveTab("home");
        window.history.pushState({ isHome: true, tab: "home" }, "");
        return;
      }

      const now = Date.now();
      if (now - lastBackClick < 2000) {
        if (Capacitor.isNativePlatform()) {
          App.exitApp();
        } else {
          setExitOverlay(true);
        }
      } else {
        setLastBackClick(now);
        toast(isRTL() ? "اضغط تراجع مرة أخرى للخروج من التطبيق ⬥" : "Press back again to exit the application ⬥");
      }
    };

    // Standard Web Back Button
    const handlePopState = (event: PopStateEvent) => {
      // If we are navigating via history, we sync the UI state
      const state = event.state;
      if (state?.tab) setActiveTab(state.tab);
      if (state?.isEditor === false) setShowEditor(false);
      if (state?.isPlusMenu === false) setShowPlusMenu(false);

      handleBackAction();
    };

    // Hardware Back Button (Android)
    const backButtonListener = App.addListener('backButton', () => {
      // In professional apps, we often want to prioritize closing overlays
      // over navigating the history stack.
      handleBackAction();
    });

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      backButtonListener.then(l => l.remove());
    };
  }, [showEditor, showPhotoEditor, showPlusMenu, activeTab, lastBackClick, activeTemplateObj, activeTemplateId, activeSmartTemplate, showGallery, showMusicLibrary]);

  const handleTabChange = (tab: string) => {
    if (tab !== activeTab) {
      window.history.pushState({ isHome: tab === "home", tab: tab }, "");
      setActiveTab(tab);
    }
  };

  useEffect(() => {
    const saved = (safeStorage.getItem("vireon:theme") as "dark" | "light" | "auto") || "dark";
    applyThemeToDOM(saved);

    const prefetchScreens = () => {
      import("@/components/HomeScreen");
      import("@/components/TemplatesScreen");
      import("@/components/CameraScreen");
      import("@/components/ProjectsScreen");
      import("@/components/SettingsScreen");
      import("@/components/EditorScreen");
      import("@/components/PhotoEditorScreen");
    };

    if ("requestIdleCallback" in window) window.requestIdleCallback(prefetchScreens);
    else setTimeout(prefetchScreens, 200);
  }, []);

  useEffect(() => {
    try {
      applyThemeToDOM(showEditor ? "dark" : ((safeStorage.getItem("vireon:theme") as "dark" | "light" | "auto") || "dark"));
    } catch {
      // ignore theme errors
    }
  }, [showEditor]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    const clearOAuthQueryParams = () => {
      const url = new URL(window.location.href);
      const keys = ["code", "state", "error", "error_description", "error_code"];
      let changed = false;
      for (const key of keys) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (changed) window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    };

    const completeOAuthIfPresent = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (!code) return;

      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (active) setSession(data.session ?? null);
      } catch (error) {
        console.warn("Supabase OAuth code exchange failed:", error);
      } finally {
        clearOAuthQueryParams();
        if (active) setAuthChecked(true);
      }
    };

    const timeoutId = window.setTimeout(() => {
      if (active) setAuthChecked(true);
    }, 5000);

    completeOAuthIfPresent().finally(() => {
      try {
        const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (!active) return;
          setSession(nextSession);
          setAuthChecked(true);
          window.clearTimeout(timeoutId);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      } catch (error) {
        console.warn("Supabase auth listener unavailable:", error);
        if (active) setAuthChecked(true);
      }

      supabase.auth
        .getSession()
        .then(({ data: { session: nextSession } }) => {
          if (!active) return;
          setSession(nextSession);
          setAuthChecked(true);
          window.clearTimeout(timeoutId);
        })
        .catch((error) => {
          console.warn("Supabase getSession failed; continuing without a session:", error);
          if (active) setAuthChecked(true);
        });
    });

    return () => {
      active = false;
      unsubscribe();
      window.clearTimeout(timeoutId);
    };
  }, []);

  const handleOpenEditor = () => {
    window.history.pushState({ isEditor: true }, "");
    setShowEditor(true);
  };

  const handleStartEditorKeep = () => {
    window.history.pushState({ isEditor: true }, "");
    setShowEditor(true);
  };

  const handleGuestLogin = () => {
    safeStorage.setItem("vireon:guest", "1");
    setIsGuest(true);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn("Sign out error:", error);
    }
    safeStorage.removeItem("vireon:guest");
    setSession(null);
    setIsGuest(false);
  };

  const handlePlusClick = () => {
    window.history.pushState({ isPlusMenu: true }, "");
    setShowPlusMenu(true);
  };

  const handleSelectTemplate = (tpl: any) => {
    window.history.pushState({ isTemplate: true }, "");
    setActiveTemplateObj(tpl);
  };

  const handleSelectSmartTemplate = (tpl: any) => {
    window.history.pushState({ isSmartTemplate: true }, "");
    setActiveSmartTemplate(tpl);
  };

  if (exitOverlay) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-white p-6 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-6 shadow-lg shadow-primary/20">
          <span className="text-2xl font-extrabold tracking-wider text-primary-foreground">V</span>
        </div>
        <h1 className="text-xl font-heading font-extrabold text-foreground mb-2 text-center">
          {isRTL() ? "تم الخروج بنجاح" : "Successfully Exited"}
        </h1>
        <p className="text-sm text-zinc-400 text-center max-w-xs leading-relaxed">
          {isRTL()
            ? "نشكرك على استخدام تطبيقنا. يمكنك الآن إغلاق هذه الصفحة أو التبويب بأمان."
            : "Thank you for using our app. You can now safely close this tab or page."}
        </p>
        <button
          onClick={() => {
            setExitOverlay(false);
            window.history.pushState({ isHome: true }, "");
          }}
          className="mt-8 px-5 py-2.5 rounded-xl bg-zinc-800 text-sm font-semibold hover:bg-zinc-700 transition-colors"
        >
          {isRTL() ? "العودة للتطبيق" : "Re-enter Application"}
        </button>
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="animate-pulse text-primary font-heading font-bold text-lg">Vireon AI</div>
      </div>
    );
  }

  if (!session && !isGuest) {
    return (
      <AuthScreen
        onGuestLogin={handleGuestLogin}
        onLoginSuccess={() => {
          supabase.auth
            .getSession()
            .then(({ data: { session: currentSession } }) => {
              setSession(currentSession);
              setAuthChecked(true);
            })
            .catch(() => setAuthChecked(true));
        }}
      />
    );
  }

  if (showEditor) {
    return (
      <div className="dark">
        <Suspense fallback={<ScreenLoader />}>
          <EditorScreen
            onOpenMusicLibrary={(time) => {
              setMusicTargetTime(time || 0);
              setShowMusicLibrary(true);
            }}
            onBack={() => {
              if (window.history.state?.isEditor) {
                window.history.back();
              } else {
                setShowEditor(false);
                const saved = (safeStorage.getItem("vireon:theme") as "dark" | "light" | "auto") || "dark";
                applyThemeToDOM(saved);
              }
            }}
          />
        </Suspense>

        {showMusicLibrary && (
          <Suspense fallback={<ScreenLoader />}>
            <MusicLibrary
              onClose={() => setShowMusicLibrary(false)}
              onAdd={handleAddMusic}
            />
          </Suspense>
        )}
      </div>
    );
  }

  if (activeSmartTemplate) {
    return (
      <div className="dark">
        <Suspense fallback={<ScreenLoader />}>
          <SmartTemplateQuickEditor
            initialTemplate={activeSmartTemplate}
            onBack={() => setActiveSmartTemplate(null)}
            onOpenFullEditor={() => {
              setActiveSmartTemplate(null);
              handleOpenEditor();
            }}
          />
        </Suspense>
      </div>
    );
  }

  if (activeTemplateObj || activeTemplateId) {
    return (
      <div className="dark">
        <Suspense fallback={<ScreenLoader />}>
          <TemplateUseScreen
            templateObj={activeTemplateObj}
            templateId={activeTemplateId || undefined}
            onBack={() => {
              setActiveTemplateObj(null);
              setActiveTemplateId(null);
              const url = new URL(window.location.href);
              url.searchParams.delete("templateId");
              url.searchParams.delete("template");
              window.history.replaceState({}, "", url.toString());
            }}
          />
        </Suspense>
      </div>
    );
  }

  if (showPhotoEditor) {
    return (
      <Suspense fallback={<ScreenLoader />}>
        <PhotoEditorScreen
          onClose={() => {
            if (window.history.state?.isPhotoEditor) {
              window.history.back();
            } else {
              setShowPhotoEditor(false);
            }
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-background select-none" dir={isRTL() ? "rtl" : "ltr"}>
      <Suspense fallback={<ScreenLoader />}>
        {activeTab === "home" && (
          <HomeScreen onNavigate={handleTabChange} onStartEditor={handleOpenEditor} session={session} newProject={newProject} />
        )}
        {activeTab === "templates" && (
          <TemplatesScreen
            onStartEditor={handleOpenEditor}
            onSelectPublishedTemplate={handleSelectTemplate}
            onSelectSmartTemplateQuick={handleSelectSmartTemplate}
          />
        )}
        {activeTab === "camera" && <CameraScreen />}
        {activeTab === "projects" && <ProjectsScreen onStartEditor={handleStartEditorKeep} />}
        {activeTab === "settings" && <SettingsScreen session={session} isGuest={isGuest} onLogout={handleLogout} />}
      </Suspense>

      <BottomNav active={activeTab} onNavigate={handleTabChange} onPlusClick={handlePlusClick} />

      {showPlusMenu && (
        <div className="fixed inset-0 z-[55] bg-black/60 flex items-end" onClick={() => setShowPlusMenu(false)}>
          <div
            className="w-full glass border-t border-border rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom duration-200"
            dir={isRTL() ? "rtl" : "ltr"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-bold text-foreground">{t("plus.title")}</h2>
              <button onClick={() => setShowPlusMenu(false)} className="p-1.5 rounded-lg hover:bg-secondary">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setShowPlusMenu(false);
                  window.history.pushState({ isPhotoEditor: true }, "");
                  setShowPhotoEditor(true);
                }}
                className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-secondary hover:bg-secondary/70 transition-colors"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center">
                  <ImageIcon className="w-7 h-7 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">{t("plus.photoEditor")}</span>
              </button>
              <button
                onClick={() => {
                  setShowPlusMenu(false);
                  setActiveTab("camera");
                }}
                className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-secondary hover:bg-secondary/70 transition-colors"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center">
                  <CameraIcon className="w-7 h-7 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">{t("plus.camera")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
