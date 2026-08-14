import { AudioEnhancementPlugin } from "./AudioEnhancementPlugin";
import { ImageEnhancementPlugin } from "./ImageEnhancementPlugin";
import { VideoEnhancementPlugin } from "./VideoEnhancementPlugin";
import { AIPlugin } from "./types";

export * from "./types";
export { BasePlugin } from "./BasePlugin";
export { AudioEnhancementPlugin } from "./AudioEnhancementPlugin";
export { ImageEnhancementPlugin } from "./ImageEnhancementPlugin";
export { VideoEnhancementPlugin } from "./VideoEnhancementPlugin";

export class AIPluginRegistry {
  private static instance: AIPluginRegistry;
  private plugins: Map<string, AIPlugin> = new Map();

  private constructor() {
    this.registerDefaultPlugins();
  }

  public static getInstance(): AIPluginRegistry {
    if (!AIPluginRegistry.instance) {
      AIPluginRegistry.instance = new AIPluginRegistry();
    }
    return AIPluginRegistry.instance;
  }

  private registerDefaultPlugins(): void {
    const audioEnhance = new AudioEnhancementPlugin();
    this.registerPlugin(audioEnhance);

    const imageEnhance = new ImageEnhancementPlugin();
    this.registerPlugin(imageEnhance);

    const videoEnhance = new VideoEnhancementPlugin();
    this.registerPlugin(videoEnhance);
  }


  public registerPlugin(plugin: AIPlugin): void {
    this.plugins.set(plugin.id, plugin);
    plugin.initialize().catch((err) => {
      console.warn(`[AIPluginRegistry] Initialization error for ${plugin.name}:`, err);
    });
    console.log(`[AIPluginRegistry] Registered AI Plugin: ${plugin.name} (${plugin.id})`);
  }

  public getPlugin<T extends AIPlugin = AIPlugin>(pluginId: string): T | undefined {
    return this.plugins.get(pluginId) as T;
  }

  public listPlugins(): AIPlugin[] {
    return Array.from(this.plugins.values());
  }
}

let _aiPluginsProxyInstance: AIPluginRegistry | null = null;
export const aiPlugins: AIPluginRegistry = new Proxy({} as AIPluginRegistry, {
  get(_target, prop, receiver) {
    if (!_aiPluginsProxyInstance) {
      _aiPluginsProxyInstance = AIPluginRegistry.getInstance();
    }
    const val = Reflect.get(_aiPluginsProxyInstance, prop, receiver);
    return typeof val === "function" ? val.bind(_aiPluginsProxyInstance) : val;
  },
});
