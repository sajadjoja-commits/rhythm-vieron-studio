import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Lock, LogIn, User, Loader2, Info, ChevronDown, ChevronUp, Database } from "lucide-react";
import { VireonLogo } from "@/components/VireonLogo";
import { t, getLang } from "@/lib/i18n";

interface AuthScreenProps {
  onGuestLogin: () => void;
}

const AuthScreen = ({ onGuestLogin }: AuthScreenProps) => {
  const en = getLang() === "en";
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success(en ? "Signed in!" : "تم تسجيل الدخول!");
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success(en ? "Account created!" : "تم إنشاء الحساب!");
      }
    } catch (err: any) {
      toast.error(err.message || (en ? "An error occurred" : "حدث خطأ"));
    } finally { setLoading(false); }
  };

  // Google sign-in: try Supabase OAuth redirect first, then GIS token flow
  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      // Attempt 1: Supabase built-in OAuth redirect
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) {
        console.warn("Supabase OAuth failed:", error.message);
        // Attempt 2: Google Identity Services token flow
        await handleGoogleGIS();
        return;
      }
      if (data?.url) return; // redirect happening
      await handleGoogleGIS();
    } catch (err: any) {
      console.warn("OAuth exception:", err);
      await handleGoogleGIS();
    }
  };

  // GIS fallback: get Google ID token via Google Identity Services
  const handleGoogleGIS = async () => {
    // Load GIS script if not loaded
    if (!(window as any).google?.accounts?.oauth2) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.getElementById("gis-script");
        if (existing) { existing.remove(); }
        const script = document.createElement("script");
        script.id = "gis-script";
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("GIS load failed"));
        document.head.appendChild(script);
      }).catch(() => {
        toast.error(en ? "Google sign-in unavailable" : "تسجيل الدخول بجوجل غير متاح");
        setGoogleLoading(false);
        return null;
      });
    }

    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      toast.error(en ? "Google sign-in unavailable" : "تسجيل الدخول بجوجل غير متاح");
      setGoogleLoading(false);
      return;
    }

    // Get the Google Client ID from our edge function
    let clientId: string | undefined;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "get-client-id" }),
      });
      const data = await res.json();
      if (data.client_id) clientId = data.client_id;
    } catch (e) {
      console.warn("Failed to get client ID from edge function");
    }

    if (!clientId) {
      toast.error(en
        ? "Google OAuth not configured. Please sign in with email."
        : "تسجيل الدخول بجوجل غير مكون. الرجاء استخدام البريد الإلكتروني.");
      setGoogleLoading(false);
      return;
    }

    // Initialize GIS token client and request access token
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "openid email profile",
      callback: async (resp: any) => {
        if (resp.error) {
          console.error("GIS error:", resp.error);
          toast.error(en ? "Google sign-in failed" : "فشل تسجيل الدخول بجوجل");
          setGoogleLoading(false);
          return;
        }
        try {
          // Get user info from Google
          const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${resp.access_token}` },
          });
          const userInfo = await userInfoRes.json();

          // Try to sign in with Supabase using the ID token
          const { data: signInData, error: signInError } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: resp.access_token,
          });
          if (signInError) {
            console.warn("signInWithIdToken failed:", signInError.message);
            // Last resort: create account via email if Google provided one
            if (userInfo.email) {
              toast.info(en
                ? `Google email: ${userInfo.email}. Please sign in with email/password.`
                : `بريد جوجل: ${userInfo.email}. الرجاء التسجيل بالبريد وكلمة المرور.`);
            } else {
              toast.error(en ? "Google sign-in not fully configured" : "تسجيل الدخول بجوجل غير مكون بالكامل");
            }
            setGoogleLoading(false);
            return;
          }
          toast.success(en ? "Signed in with Google!" : "تم تسجيل الدخول بجوجل!");
        } catch (err: any) {
          console.error("GIS callback error:", err);
          toast.error(en ? "Google sign-in failed" : "فشل تسجيل الدخول بجوجل");
          setGoogleLoading(false);
        }
      },
    });
    tokenClient.requestAccessToken({ prompt: "consent" });
  };

  const isAnyLoading = loading || googleLoading;

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6" dir={en ? "ltr" : "rtl"}>
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 mb-8">
          <VireonLogo className="w-16 h-16" />
          <h1 className="font-heading text-2xl font-bold text-foreground">Vireon AI</h1>
          <p className="text-sm text-muted-foreground">{t("auth.subtitle")}</p>
        </div>

        <button
          onClick={handleGoogle}
          disabled={isAnyLoading}
          className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-white text-gray-900 font-bold text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm"
        >
          {googleLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          )}
          {googleLoading ? (en ? "Redirecting..." : "جارٍ التحويل...") : t("auth.signInGoogle")}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] text-muted-foreground">{en ? "or" : "أو"}</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-3">
          <div className="relative">
            <Mail className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
            <input type="email" placeholder={t("auth.email")} value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full ${en ? "pl-10 pr-4" : "pr-10 pl-4"} py-3 rounded-xl bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary`} required />
          </div>
          <div className="relative">
            <Lock className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
            <input type="password" placeholder={t("auth.password")} value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full ${en ? "pl-10 pr-4" : "pr-10 pl-4"} py-3 rounded-xl bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary`} required minLength={6} />
          </div>
          <button type="submit" disabled={isAnyLoading}
            className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm glow-primary disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {loading ? (isLogin ? t("auth.signingIn") : t("auth.signingUp")) : (isLogin ? t("auth.signIn") : t("auth.signUp"))}
          </button>
        </form>

        <button onClick={() => setIsLogin(!isLogin)} className="w-full text-center text-xs text-primary font-medium">
          {isLogin ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
          <span className="font-bold">{isLogin ? t("auth.signUp") : t("auth.signIn")}</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] text-muted-foreground">{en ? "or" : "أو"}</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <button onClick={onGuestLogin}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary text-foreground font-bold text-sm hover:bg-secondary/80 transition-all">
          <User className="w-4 h-4" />
          {t("auth.continueAsGuest")}
        </button>
        <p className="text-center text-[10px] text-muted-foreground">{t("auth.guestNote")}</p>

        {/* Database & Auth Helper Guide */}
        <div className="pt-2 border-t border-border/60">
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/40 hover:bg-secondary/70 transition-all text-[11px] font-medium text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-primary" />
              {en ? "Database & Login Configuration Guide" : "دليل إعدادات قاعدة البيانات والتسجيل"}
            </span>
            {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          
          {showGuide && (
            <div className="mt-2 p-3.5 rounded-xl bg-secondary/20 border border-border/40 text-[11px] leading-relaxed text-muted-foreground space-y-3 text-right animate-in fade-in slide-in-from-top-1 duration-200" dir={en ? "ltr" : "rtl"}>
              <p className="font-semibold text-foreground text-xs border-b border-border/40 pb-1 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-primary" />
                {en ? "How to make login work?" : "كيف تجعل التسجيل يعمل بنجاح؟"}
              </p>
              
              <div className={en ? "text-left" : "text-right"}>
                <span className="font-bold text-foreground block mb-0.5 text-xs">
                  1. {en ? "Disable Email Confirmation (Important!)" : "إيقاف تأكيد البريد الإلكتروني (هام جداً!)"}
                </span>
                <span>
                  {en 
                    ? "In Supabase Dashboard: Go to Authentication -> Providers -> Email, and turn off 'Confirm email'. This allows instant login without verification emails." 
                    : "من لوحة تحكم سوبابيز: اذهب إلى Authentication ثم Providers ثم Email، وقم بإيقاف خيار 'Confirm email'. هذا يسمح لك بإنشاء حساب وتسجيل الدخول فوراً بدون تفعيل."}
                </span>
              </div>

              <div className={en ? "text-left" : "text-right"}>
                <span className="font-bold text-foreground block mb-0.5 text-xs">
                  2. {en ? "Google OAuth Setup" : "تفعيل تسجيل الدخول بجوجل"}
                </span>
                <span>
                  {en 
                    ? "To fix 'Unsupported provider', enable Google in Supabase (Authentication -> Providers -> Google) and enter your Google OAuth Client ID & Client Secret." 
                    : "لحل خطأ 'Unsupported provider'، يجب تفعيل Google في لوحة سوبابيز (Authentication -> Providers -> Google) وإدخال الـ Client ID والـ Client Secret الخاص بجوجل."}
                </span>
              </div>

              <div className={en ? "text-left" : "text-right"}>
                <span className="font-bold text-foreground block mb-0.5 text-xs">
                  3. {en ? "Guest Mode (Offline/Instant)" : "المتابعة كضيف (فوري وبدون قاعدة بيانات)"}
                </span>
                <span>
                  {en 
                    ? "Click 'Continue as Guest' to bypass login completely. All projects will be saved locally in your browser using IndexedDB!" 
                    : "اضغط على 'المتابعة كضيف' لتخطي التسجيل بالكامل. سيتم حفظ جميع مشاريعك وملفاتك محلياً في المتصفح بأمان وسرعة فائقة!"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
