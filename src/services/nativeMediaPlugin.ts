import { registerPlugin } from "@capacitor/core";

// All screens and services share one Capacitor registration.
let plugin: unknown;

export function getNativeMediaPlugin<T = any>(): T {
  if (!plugin) plugin = registerPlugin("VireonMedia");
  return plugin as T;
}