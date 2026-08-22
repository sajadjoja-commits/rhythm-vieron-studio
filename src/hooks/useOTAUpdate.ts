import { useState, useEffect } from "react";
import { otaService, OTAUpdateState } from "@/services/capgo";

/**
 * Custom hook to interact with Vieron OTA update system
 */
export function useOTAUpdate() {
  const [state, setState] = useState<OTAUpdateState>(otaService.getState());

  useEffect(() => {
    // Subscribe to state changes from the central service
    const unsubscribe = otaService.subscribe((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  return {
    ...state,
    checkForUpdate: () => otaService.checkForUpdate(),
    downloadUpdate: () => otaService.downloadUpdate(),
    applyUpdate: () => otaService.applyUpdate(),
  };
}
