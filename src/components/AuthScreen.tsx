import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  LogIn,
  User,
  Mail,
  Lock,
  KeyRound,
  ArrowLeft,
  Eye,
  EyeOff,
  Camera,
  UserPlus,
  Sparkles,
  Check,
} from "lucide-react";
import { VireonLogo } from "@/components/VireonLogo";
import { t, getLang } from "@/lib/i18n";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";

interface AuthScreenProps {
  onGuestLogin?: () => void;
  onLoginSuccess?: () => void;
}
type AuthMode = "signin" | "signup" | "forgot";

const PRESET_AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80",
];

const AuthScreen = ({ onGuestLogin, onLoginSuccess }: AuthScreenProps) => {
  const en = getLang() === "en";
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const busy = loading || googleLoading;

  // Listen for native deep link callback (vireon://auth-callback)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let sub: any;
    const setupDeepLink = async () => {
      sub = await CapApp.addListener("appUrlOpen", async (event) => {
        if (event.url && (event.url.includes("auth-callback") || event.url.startsWith("vireon://"))) {
          try {
            await Browser.close();
          } catch {
            // ignore
          }

          let code: string | null = null;
          let accessToken: string | null = null;
          let refreshToken: string | null = null;

          try {
            const rawUrl = event.url.replace("vireon://", "https://vireon.ai/");
            const urlObj = new URL(rawUrl);
            code = urlObj.searchParams.get("code");
            accessToken = urlObj.searchParams.get("access_token");
            refreshToken = urlObj.searchParams.get("refresh_token");

            if (!code && !accessToken && urlObj.hash) {
              const hashStr = urlObj.hash.startsWith("#") ? urlObj.hash.slice(1) : urlObj.hash;
              const hashParams = new URLSearchParams(hashStr);
              code = hashParams.get("code");
              accessToken = hashParams.get("access_token");
              refreshToken = hashParams.get("refresh_token");
            }
          } catch (e) {
            console.error("[DeepLink Parse Error]", e);
          }

          if (code) {
            try {
              const { data, error } = await supabase.auth.exchangeCodeForSession(code);
              if (error) throw error;
              if (data.session) {
                toast.success(en ? "Logged in successfully!" : "تم تسجيل الدخول بنجاح!");
                onLoginSuccess?.();
              }
            } catch (err: any) {
              console.error("[DeepLink Code Exchange]", err);
            }
          } else if (accessToken && refreshToken) {
            try {
              const { data, error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (error) throw error;
              if (data.session) {
                toast.success(en ? "Logged in successfully!" : "تم تسجيل الدخول بنجاح!");
                onLoginSuccess?.();
              }
            } catch (err: any) {
              console.error("[DeepLink Session Set]", err);
            }
          }
        }
      });
    };

    setupDeepLink();

    return () => {
      if (sub?.remove) sub.remove();
    };
  }, [en, onLoginSuccess]);

  const friendlyError = (error: any) => {
    const message = String(error?.message || error || "").toLowerCase();
    const status = Number(error?.status || 0);

    if (message.includes("invalid login credentials") || message.includes("invalid_grant")) {
      return en
        ? "Incorrect email or password. Please check your credentials or create a new account."
        : "البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التأكد من البيانات أو إنشاء حساب جديد.";
    }
    if (message.includes("user not found") || message.includes("no user found")) {
      return en ? "Account not found. Please sign up first." : "الحساب غير موجود. يرجى إنشاء حساب جديد أولاً.";
    }
    if (message.includes("email not confirmed")) {
      return en
        ? "Please verify your email address before signing in."
        : "يرجى تأكيد بريدك الإلكتروني أولاً من خلال الرابط المرسل لبريدك قبل تسجيل الدخول.";
    }
    if (message.includes("already registered") || message.includes("user already exists")) {
      return en ? "An account with this email already exists. Please sign in instead." : "هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول.";
    }
    if (message.includes("password should be at least") || message.includes("weak_password")) {
      return en ? "Password must be at least 6 characters." : "كلمة المرور يجب أن تكون 6 أحرف على الأقل.";
    }
    if (message.includes("invalid api key") || status === 401) {
      return en ? "Authentication service configuration error." : "خطأ في إعدادات خدمة المصادقة.";
    }
    if (message.includes("network") || message.includes("fetch") || message.includes("523") || message.includes("unreachable") || status >= 500) {
      return en ? "Network error. Please check your internet connection." : "خطأ في الاتصال بالشبكة. يرجى التحقق من الاتصال بالإنترنت.";
    }
    return error?.message || (en ? "Unexpected server error. Please try again." : "حدث خطأ غير متوقع في الخادم. يرجى المحاولة لاحقاً.");
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(en ? "Image size should be less than 5MB" : "حجم الصورة يجب أن يكون أقل من 5 ميجابايت");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(reader.result as string);
      toast.success(en ? "Profile picture selected" : "تم اختيار الصورة الشخصية");
    };
    reader.readAsDataURL(file);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.error(en ? "Enter a valid email address." : "أدخل بريداً إلكترونياً صحيحاً.");
      return;
    }
    if (mode !== "forgot" && password.length < 6) {
      toast.error(en ? "Password must be at least 6 characters." : "كلمة المرور لا تقل عن 6 أحرف.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      toast.error(en ? "Passwords do not match." : "كلمتا المرور غير متطابقتين.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success(en ? "Reset link sent to your email!" : "تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك!");
        setMode("signin");
        return;
      }

      if (mode === "signup") {
        const isNative = Capacitor.isNativePlatform();
        const redirectUrl = isNative ? "vireon://auth-callback" : `${window.location.origin}/`;

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim() || undefined,
              avatar_url: avatarUrl || undefined,
            },
            emailRedirectTo: redirectUrl,
          },
        });
        if (error) throw error;

        if (data.session) {
          toast.success(en ? "Account created and logged in!" : "تم إنشاء الحساب وتسجيل الدخول بنجاح!");
          onLoginSuccess?.();
        } else {
          toast.success(
            en
              ? "Account created! Please check your email inbox to confirm your account."
              : "تم إنشاء الحساب بنجاح! يرجى مراجعة بريدك الإلكتروني لتأكيد الحساب.",
            { duration: 8000 }
          );
          setMode("signin");
          setPassword("");
          setConfirmPassword("");
        }
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) throw error;

      if (data.session) {
        toast.success(en ? "Signed in successfully." : "تم تسجيل الدخول بنجاح.");
        onLoginSuccess?.();
      }
    } catch (error: any) {
      console.error("[Vireon Auth Error]", error);
      toast.error(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (busy) {
      console.log("[OAuth Audit Step 1] handleGoogle triggered but busy=true, aborting.");
      return;
    }
    console.log("[OAuth Audit Step 1] handleGoogle initiated. Platform isNative:", Capacitor.isNativePlatform());
    setGoogleLoading(true);
    try {
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        const redirectUrl = "vireon://auth-callback";
        console.log("[OAuth Audit Step 1.1] Native platform detected. Calling supabase.auth.signInWithOAuth with redirectTo:", redirectUrl);
        
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
            queryParams: {
              access_type: "offline",
              prompt: "select_account",
            },
          },
        });

        if (error) {
          console.error("[OAuth Audit Step 1.ERR] Supabase signInWithOAuth returned error:", error);
          throw error;
        }

        console.log("[OAuth Audit Step 2] Supabase signInWithOAuth returned URL:", data?.url);
        if (data?.url) {
          console.log("[OAuth Audit Step 2.1] Opening Chrome Custom Tab / System Browser via Browser.open()...");
          await Browser.open({ url: data.url });
          console.log("[OAuth Audit Step 2.2] Browser.open call executed successfully. Awaiting user interaction in Browser...");
        } else {
          console.warn("[OAuth Audit Step 2.WARN] No URL in signInWithOAuth response data!");
        }
      } else {
        const redirectUrl = `${window.location.origin}/`;
        console.log("[OAuth Audit Step 1.WEB] Web platform detected. Calling signInWithOAuth with redirectTo:", redirectUrl);
        
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: false,
            queryParams: {
              access_type: "offline",
              prompt: "select_account",
            },
          },
        });

        if (error) {
          console.error("[OAuth Audit Step 1.WEB_ERR] Supabase signInWithOAuth returned error:", error);
          throw error;
        }

        console.log("[OAuth Audit Step 2.WEB] Web signInWithOAuth data URL:", data?.url);
        if (data?.url) {
          window.location.href = data.url;
        }
      }
    } catch (error: any) {
      console.error("[OAuth Audit Step 1.EX] Google Auth Exception caught:", error);
      const msg = String(error?.message || error || "").toLowerCase();
      if (msg.includes("browser") && msg.includes("not implemented")) {
        console.log("[OAuth Audit Step 1.FALLBACK] Browser plugin not implemented fallback triggered.");
        try {
          const { data } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: `${window.location.origin}/`,
              skipBrowserRedirect: false,
            },
          });
          if (data?.url) window.location.href = data.url;
        } catch (e) {
          toast.error(friendlyError(e));
        }
      } else {
        toast.error(friendlyError(error));
      }
    } finally {
      setTimeout(() => {
        setGoogleLoading(false);
      }, 5000);
    }
  };

  return (
    <main
      className="min-h-[100dvh] w-full flex items-center justify-center bg-background px-4 py-8 select-none"
      dir={en ? "ltr" : "rtl"}
    >
      <section className="w-full max-w-sm space-y-5">
        {/* Header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <VireonLogo className="w-14 h-14" />
          <h1 className="font-heading text-2xl font-extrabold text-foreground tracking-tight">Vireon</h1>
          <p className="text-xs text-muted-foreground">{t("auth.subtitle")}</p>
        </div>

        {/* Tab Switcher: Sign In vs Sign Up */}
        {mode !== "forgot" && (
          <div className="flex bg-card p-1 rounded-2xl border border-border/80 shadow-sm">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
                mode === "signin"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <LogIn className="w-3.5 h-3.5" />
                <span>{en ? "Sign In" : "تسجيل الدخول"}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
                mode === "signup"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                <span>{en ? "Create Account" : "إنشاء حساب"}</span>
              </span>
            </button>
          </div>
        )}

        {/* Google Auth Button */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white text-gray-900 font-bold text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm"
        >
          {googleLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
          ) : (
            <span className="text-xl font-bold">G</span>
          )}
          <span>{googleLoading ? (en ? "Opening Google..." : "جارٍ فتح Google...") : t("auth.signInGoogle")}</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border/80" />
          <span className="text-[11px] text-muted-foreground font-medium">{en ? "or" : "أو"}</span>
          <div className="flex-1 h-px bg-border/80" />
        </div>

        {/* Dynamic Form */}
        <form
          key={`auth-form-${mode}`}
          onSubmit={handleEmailAuth}
          className="space-y-3.5"
          noValidate
        >
          {/* Sign Up Specific: Avatar & Profile Picker */}
          {mode === "signup" && (
            <div className="flex flex-col items-center gap-3 py-2 bg-card/60 p-3 rounded-2xl border border-border/60">
              <span className="text-xs font-bold text-foreground">
                {en ? "Profile Picture (Optional)" : "الصورة الشخصية (اختياري)"}
              </span>
              <div className="relative group">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-full bg-secondary border-2 border-primary/40 flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary transition-all shadow-md"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <User className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>

              {/* Preset Avatars Bar */}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-muted-foreground font-medium">
                  {en ? "Presets:" : "نماذج جاهزة:"}
                </span>
                {PRESET_AVATARS.map((url, idx) => (
                  <button
                    key={`preset-${idx}`}
                    type="button"
                    onClick={() => setAvatarUrl(url)}
                    className={`w-7 h-7 rounded-full overflow-hidden border transition-all ${
                      avatarUrl === url ? "border-primary ring-2 ring-primary/40 scale-110" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <img src={url} alt={`Avatar ${idx}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Full Name (Sign Up only) */}
          {mode === "signup" && (
            <div className="relative">
              <User
                className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none`}
              />
              <input
                type="text"
                autoComplete="name"
                placeholder={en ? "Full Name (Optional)" : "الاسم الكامل (اختياري)"}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={`w-full ${
                  en ? "pl-10 pr-4" : "pr-10 pl-4"
                } py-3 rounded-xl bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary transition-colors`}
              />
            </div>
          )}

          {/* Email Input */}
          <div className="relative">
            <Mail
              className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none`}
            />
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("auth.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full ${
                en ? "pl-10 pr-4" : "pr-10 pl-4"
              } py-3 rounded-xl bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary transition-colors`}
              required
            />
          </div>

          {/* Password Input */}
          {mode !== "forgot" && (
            <div className="relative">
              <Lock
                className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none`}
              />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={t("auth.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full ${
                  en ? "pl-10 pr-10" : "pr-10 pl-10"
                } py-3 rounded-xl bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary transition-colors`}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={busy}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className={`absolute ${en ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground`}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          )}

          {/* Confirm Password (Sign Up only) */}
          {mode === "signup" && (
            <div className="relative">
              <Lock
                className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none`}
              />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder={en ? "Confirm Password" : "تأكيد كلمة المرور"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full ${
                  en ? "pl-10 pr-10" : "pr-10 pl-10"
                } py-3 rounded-xl bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary transition-colors`}
                required
                minLength={6}
              />
            </div>
          )}

          {/* Action Submit Button */}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-md hover:scale-[1.01] active:scale-[0.98] transition-all"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === "forgot" ? (
              <KeyRound className="w-4 h-4" />
            ) : mode === "signup" ? (
              <UserPlus className="w-4 h-4" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            <span>
              {loading
                ? en
                  ? "Please wait..."
                  : "يرجى الانتظار..."
                : mode === "forgot"
                ? en
                  ? "Send Reset Link"
                  : "إرسال رابط الإعادة"
                : mode === "signup"
                ? en
                  ? "Create Account"
                  : "إنشاء حساب جديد"
                : t("auth.signIn")}
            </span>
          </button>
        </form>

        {/* Additional Mode Options */}
        <div className="flex flex-col items-center gap-2.5 text-xs pt-1">
          {mode === "signin" && (
            <button
              type="button"
              onClick={() => setMode("forgot")}
              disabled={busy}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>{en ? "Forgot password?" : "نسيت كلمة المرور؟"}</span>
            </button>
          )}

          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => setMode("signin")}
              disabled={busy}
              className="text-primary font-bold flex items-center gap-1 hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{en ? "Back to Sign In" : "العودة لتسجيل الدخول"}</span>
            </button>
          )}
        </div>

        {/* Guest Option */}
        {onGuestLogin && (
          <div className="pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={onGuestLogin}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-sm disabled:opacity-50 transition-colors"
            >
              <User className="w-4 h-4 text-muted-foreground" />
              <span>{t("auth.continueAsGuest")}</span>
            </button>
            <p className="text-center text-[10px] text-muted-foreground mt-2">
              <span>{t("auth.guestNote")}</span>
            </p>
          </div>
        )}
      </section>
    </main>
  );
};

export default AuthScreen;

