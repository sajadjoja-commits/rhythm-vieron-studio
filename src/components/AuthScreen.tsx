import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, LogIn, User, Mail, Lock, KeyRound, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { VireonLogo } from "@/components/VireonLogo";
import { t, getLang } from "@/lib/i18n";

interface AuthScreenProps { onGuestLogin?: () => void; onLoginSuccess?: () => void; }
type AuthMode = "signin" | "signup" | "forgot";

const AuthScreen = ({ onGuestLogin, onLoginSuccess }: AuthScreenProps) => {
  const en = getLang() === "en";
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const busy = loading || googleLoading;

  const friendlyError = (error: any) => {
    const message = String(error?.message || error || "").toLowerCase();
    const status = Number(error?.status || 0);
    if (message.includes("invalid login credentials") || message.includes("invalid_grant"))
      return en ? "Incorrect email or password. Use Sign Up for a new account, or Forgot password to reset it." : "البريد الإلكتروني أو كلمة المرور غير صحيحة. استخدم إنشاء حساب لحساب جديد أو نسيت كلمة المرور لإعادة التعيين.";
    if (message.includes("email not confirmed")) return en ? "Please confirm your email, then sign in again." : "يرجى تأكيد بريدك الإلكتروني ثم تسجيل الدخول مرة أخرى.";
    if (message.includes("already registered") || message.includes("user already exists")) return en ? "This email already has an account. Switch to Sign In." : "هذا البريد لديه حساب مسبقاً. انتقل إلى تسجيل الدخول.";
    if (message.includes("password should be at least")) return en ? "Password must be at least 6 characters." : "كلمة المرور يجب أن تكون 6 أحرف على الأقل.";
    if (message.includes("invalid api key") || status === 401) return en ? "Authentication configuration is unavailable. Please try again." : "إعدادات المصادقة غير متاحة حالياً. حاول مرة أخرى.";
    if (message.includes("network") || message.includes("fetch") || message.includes("523") || message.includes("unreachable") || status >= 500)
      return en ? "Authentication service is temporarily unavailable. Please try again." : "خدمة المصادقة غير متاحة مؤقتاً. حاول مرة أخرى.";
    return error?.message || (en ? "Authentication failed." : "فشلت عملية المصادقة.");
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) { toast.error(en ? "Enter a valid email address." : "أدخل بريداً إلكترونياً صحيحاً."); return; }
    if (mode !== "forgot" && password.length < 6) { toast.error(en ? "Password must be at least 6 characters." : "كلمة المرور لا تقل عن 6 أحرف."); return; }
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: `${window.location.origin}/` });
        if (error) throw error;
        toast.success(en ? "Reset link sent to your email." : "تم إرسال رابط إعادة التعيين إلى بريدك.");
        setMode("signin");
        return;
      }
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: `${window.location.origin}/` } });
        if (error) throw error;
        if (data.session) { toast.success(en ? "Account created successfully." : "تم إنشاء الحساب بنجاح."); onLoginSuccess?.(); }
        else { toast.success(en ? "Account created. Check your email to confirm it, then sign in." : "تم إنشاء الحساب. تحقق من بريدك لتأكيد الحساب ثم سجل الدخول."); setMode("signin"); setPassword(""); }
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) throw error;
      if (data.session) { toast.success(en ? "Signed in successfully." : "تم تسجيل الدخول بنجاح."); onLoginSuccess?.(); }
    } catch (error: any) {
      console.error("[Vireon Auth]", error);
      toast.error(friendlyError(error));
    } finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    if (busy) return;
    setGoogleLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/`, skipBrowserRedirect: true, queryParams: { access_type: "offline", prompt: "select_account" } },
      });
      if (error) throw error;
      if (!data?.url) throw new Error(en ? "Google sign-in URL was not returned." : "لم يتم الحصول على رابط تسجيل الدخول بجوجل.");
      window.location.assign(data.url);
    } catch (error: any) {
      console.error("[Vireon Google Auth]", error);
      toast.error(friendlyError(error));
      setGoogleLoading(false);
    }
  };

  return (
    <main className="min-h-[100dvh] w-full flex items-center justify-center bg-background px-4 py-8" dir={en ? "ltr" : "rtl"}>
      <section className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <VireonLogo className="w-14 h-14" />
          <h1 className="font-heading text-2xl font-bold text-foreground tracking-tight">Vireon</h1>
          <p className="text-xs text-muted-foreground">{t("auth.subtitle")}</p>
        </div>

        <button type="button" onClick={handleGoogle} disabled={busy} className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white text-gray-900 font-bold text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm">
          {googleLoading ? <Loader2 className="w-5 h-5 animate-spin text-gray-600" /> : <span className="text-xl font-bold">G</span>}
          <span>{googleLoading ? (en ? "Opening Google..." : "جارٍ فتح Google...") : t("auth.signInGoogle")}</span>
        </button>

        <div className="flex items-center gap-3"><div className="flex-1 h-px bg-border" /><span className="text-[11px] text-muted-foreground">{en ? "or" : "أو"}</span><div className="flex-1 h-px bg-border" /></div>

        <form onSubmit={handleEmailAuth} className="space-y-3" noValidate>
          <div className="relative">
            <Mail className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none`} />
            <input type="email" inputMode="email" autoComplete="email" placeholder={t("auth.email")} value={email} onChange={e => setEmail(e.target.value)} className={`w-full ${en ? "pl-10 pr-4" : "pr-10 pl-4"} py-3 rounded-xl bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary`} required />
          </div>
          {mode !== "forgot" && <div className="relative">
            <Lock className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none`} />
            <input type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder={t("auth.password")} value={password} onChange={e => setPassword(e.target.value)} className={`w-full ${en ? "pl-10 pr-10" : "pr-10 pl-10"} py-3 rounded-xl bg-card border border-border text-foreground text-sm focus:outline-none focus:border-primary`} required minLength={6} />
            <button type="button" onClick={() => setShowPassword(v => !v)} disabled={busy} aria-label={showPassword ? "Hide password" : "Show password"} className={`absolute ${en ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 text-muted-foreground`}>{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
          </div>}
          <button type="submit" disabled={busy} className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "forgot" ? <KeyRound className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            <span>{loading ? (en ? "Please wait..." : "يرجى الانتظار...") : mode === "forgot" ? (en ? "Send Reset Link" : "إرسال رابط الإعادة") : mode === "signup" ? t("auth.signUp") : t("auth.signIn")}</span>
          </button>
        </form>

        <div className="flex flex-col items-center gap-2 text-xs">
          {mode === "signin" && <><button type="button" onClick={() => setMode("signup")} disabled={busy} className="text-primary font-medium hover:underline"><span>{t("auth.noAccount")}</span> <b>{t("auth.signUp")}</b></button><button type="button" onClick={() => setMode("forgot")} disabled={busy} className="text-muted-foreground">{en ? "Forgot password?" : "نسيت كلمة المرور؟"}</button></>}
          {mode === "signup" && <button type="button" onClick={() => setMode("signin")} disabled={busy} className="text-primary font-medium hover:underline"><span>{t("auth.haveAccount")}</span> <b>{t("auth.signIn")}</b></button>}
          {mode === "forgot" && <button type="button" onClick={() => setMode("signin")} disabled={busy} className="text-primary font-medium flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" />{en ? "Back to Sign In" : "العودة لتسجيل الدخول"}</button>}
        </div>

        {onGuestLogin && <><div className="flex items-center gap-3"><div className="flex-1 h-px bg-border" /><span className="text-[11px] text-muted-foreground">{en ? "or" : "أو"}</span><div className="flex-1 h-px bg-border" /></div><button type="button" onClick={onGuestLogin} disabled={busy} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary text-foreground font-bold text-sm disabled:opacity-50"><User className="w-4 h-4" /><span>{t("auth.continueAsGuest")}</span></button><p className="text-center text-[10px] text-muted-foreground">{t("auth.guestNote")}</p></>}
      </section>
    </main>
  );
};

export default AuthScreen;
