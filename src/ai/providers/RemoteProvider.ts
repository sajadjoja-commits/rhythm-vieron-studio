import { BaseProvider } from "./BaseProvider";
import { ProviderType } from "../types/provider";
import { KeyManager } from "../keyManager/KeyManager";
import { isOnline } from "../utils/netUtils";

export abstract class RemoteProvider extends BaseProvider {
  public type: ProviderType = "remote";
  protected keyManager: KeyManager;

  constructor(keyManager: KeyManager) {
    super();
    this.keyManager = keyManager;
  }

  protected checkNetwork(): boolean {
    return isOnline();
  }
}
