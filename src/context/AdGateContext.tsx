import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";
import { AdFeature, incUsage, needsAd, isPremium } from "@/lib/adManager";
import PaymentPaywall from "@/components/PaymentPaywall";

interface AdGateValue {
  /**
   * Grants access to a gated feature. While the user has free daily actions
   * left (or is premium) it increments usage and resolves true immediately.
   * Otherwise it opens the manual local-payment paywall and resolves false.
   */
  requestAccess: (feature: AdFeature, freeLimit?: number) => Promise<boolean>;
  openPaywall: () => void;
}

const AdGateContext = createContext<AdGateValue | null>(null);

export const AdGateProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const requestAccess = useCallback((feature: AdFeature, freeLimit?: number) => {
    return new Promise<boolean>((resolve) => {
      if (isPremium() || !needsAd(feature, freeLimit)) {
        incUsage(feature);
        resolve(true);
        return;
      }
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const openPaywall = useCallback(() => setOpen(true), []);

  const close = () => {
    setOpen(false);
    resolverRef.current?.(false);
    resolverRef.current = null;
  };

  return (
    <AdGateContext.Provider value={{ requestAccess, openPaywall }}>
      {children}
      {open && <PaymentPaywall onClose={close} />}
    </AdGateContext.Provider>
  );
};

export const useAdGate = (): AdGateValue => {
  const ctx = useContext(AdGateContext);
  if (!ctx) throw new Error("useAdGate must be used within AdGateProvider");
  return ctx;
};
