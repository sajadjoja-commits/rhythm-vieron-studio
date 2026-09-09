import { BaseProvider } from "./BaseProvider";
import { ProviderType } from "../types/provider";

export abstract class LocalProvider extends BaseProvider {
  public type: ProviderType = "local";
  protected isModelLoaded: boolean = false;

  public abstract loadModel(): Promise<boolean>;
  public abstract unloadModel(): Promise<void>;
}
