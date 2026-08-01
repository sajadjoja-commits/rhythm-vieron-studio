import { useState } from "react";
import { X, Copy, Eye, EyeOff, Check, Upload, Crown, ShieldCheck, CreditCard } from "lucide-react";
import { toast } from "sonner";
import {
  PAY_METHODS,
  PRICE_LABEL,
  PLANS,
  maskValue,
  savePaymentSubmission,
  PayMethod,
} from "@/lib/paymentConfig";

interface Props {
  onClose: () => void;
}

/** A single sensitive value with mask / show / copy controls. */
const SecretValue = ({ value, reveal = 0 }: { value: string; reveal?: number }) => {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setShown(true);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("تم نسخ الرقم");
    } catch {
      setShown(true);
      toast.error("انسخ الرقم يدوياً");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 text-sm font-bold tracking-widest text-foreground bg-background/60 rounded-lg px-3 py-2 select-all">
        {shown ? value : maskValue(value, reveal)}
      </code>
      <button
        onClick={() => setShown((s) => !s)}
        className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0"
        aria-label="show"
      >
        {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button
        onClick={copy}
        className="w-9 h-9 rounded-lg gradient-primary text-primary-foreground flex items-center justify-center shrink-0"
        aria-label="copy"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
};

const MethodCard = ({ m }: { m: PayMethod }) => (
  <div className="rounded-2xl border border-border overflow-hidden">
    {/* Card visual */}
    <div className="relative p-4 bg-gradient-to-br from-slate-800 via-slate-900 to-black">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-bold text-white/70">{m.title}</span>
        <div className="flex -space-x-2">
          <span className="w-6 h-6 rounded-full bg-red-500/90" />
          <span className="w-6 h-6 rounded-full bg-amber-400/90" />
        </div>
      </div>
      {m.value && <SecretValue value={m.value} reveal={m.reveal} />}
      {m.fields?.map((f) => (
        <div key={f.label} className="flex items-center justify-between text-[10px] mt-2">
          <span className="text-white/50">{f.label}</span>
          <span className="font-bold text-white/90">{f.value}</span>
        </div>
      ))}
    </div>
    {(m.note || m.steps) && (
      <div className="bg-card p-3 space-y-2">
        {m.note && <p className="text-[11px] text-muted-foreground leading-relaxed">{m.note}</p>}
        {m.steps && (
          <ol className="space-y-1 rounded-lg bg-background/50 p-2">
            {m.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-muted-foreground leading-relaxed">
                <span className="w-4 h-4 rounded-full gradient-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        )}
      </div>
    )}
  </div>
);

const PaymentPaywall = ({ onClose }: Props) => {
  const [method, setMethod] = useState(PAY_METHODS[0].id);
  const [planId, setPlanId] = useState(PLANS[1]?.id ?? PLANS[0].id);
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<string | undefined>();
  const [receiptName, setReceiptName] = useState("");
  const [done, setDone] = useState(false);

  const plan = PLANS.find((p) => p.id === planId) ?? PLANS[0];

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setReceiptName(f.name);
    const r = new FileReader();
    r.onload = () => setReceipt(r.result as string);
    r.readAsDataURL(f);
  };

  const submit = () => {
    if (!reference.trim()) {
      toast.error("أدخل رقم العملية أو كود التعبئة");
      return;
    }
    savePaymentSubmission({
      method,
      plan: plan.id,
      amount: plan.price,
      reference: reference.trim(),
      receipt,
      at: Date.now(),
    });
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3" dir="rtl">
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-popover border border-border shadow-2xl animate-scale-in">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-popover/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-bold text-foreground">ترقية إلى Premium</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/15 flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-emerald-400" />
            </div>
            <p className="text-sm font-bold text-foreground">شكراً لك!</p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              يتم التحقق من دفعتك يدوياً. سيتم تفعيل الميزات المدفوعة خلال ساعة واحدة.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm"
            >
              حسناً
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">{PRICE_LABEL}</p>
              <p className="text-[11px] text-muted-foreground">
                اختر خطة اشتراك وادفع محلياً لفتح كل الميزات.
              </p>
            </div>

            {/* subscription plans */}
            <div className="grid grid-cols-3 gap-2">
              {PLANS.map((p) => {
                const active = p.id === planId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPlanId(p.id)}
                    className={`relative flex flex-col items-center gap-1 rounded-xl border p-3 transition-all ${
                      active
                        ? "border-primary bg-primary/15 ring-1 ring-primary"
                        : "border-border bg-card"
                    }`}
                  >
                    {p.badge && (
                      <span className="absolute -top-2 right-1/2 translate-x-1/2 whitespace-nowrap text-[8px] font-bold px-2 py-0.5 rounded-full gradient-primary text-primary-foreground">
                        {p.badge}
                      </span>
                    )}
                    <span className="text-[11px] font-bold text-foreground mt-1">{p.title}</span>
                    <span className="text-lg font-black text-foreground leading-none">
                      ${p.price}
                    </span>
                    <span className="text-[9px] text-muted-foreground">{p.period}</span>
                    {p.note && <span className="text-[8px] text-primary">{p.note}</span>}
                  </button>
                );
              })}
            </div>


            {/* payment methods */}
            <div className="space-y-2">
              {PAY_METHODS.map((m) => (
                <MethodCard key={m.id} m={m} />
              ))}
            </div>

            {/* submission form */}
            <div className="rounded-xl bg-card border border-border p-3 space-y-3">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-primary" /> تأكيد الدفع — {plan.title} (${plan.price})
              </p>


              <div>
                <label className="text-[11px] text-muted-foreground">
                  رقم العملية / رقم الإيصال / كود التعبئة
                </label>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="مثال: TX123456789"
                  className="w-full mt-1 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground"
                />
              </div>

              <label className="flex items-center gap-2 rounded-lg bg-background border border-dashed border-border px-3 py-2.5 cursor-pointer">
                <Upload className="w-4 h-4 text-primary" />
                <span className="text-[11px] text-muted-foreground flex-1 truncate">
                  {receiptName || "رفع صورة الإيصال (اختياري)"}
                </span>
                <input type="file" accept="image/*" hidden onChange={onFile} />
              </label>

              <button
                onClick={submit}
                className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm"
              >
                إرسال — ${plan.price}
              </button>

            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentPaywall;
