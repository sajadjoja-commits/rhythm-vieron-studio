/**
 * RMBG-2.0 Model Manifest
 * 
 * NOTE: Disabled by default due to:
 * 1. Non-commercial license (CC BY-NC 4.0)
 * 2. High memory footprint and conflicting weight specifications (176MB vs 348MB)
 */

export const ENABLE_RMBG = false;

export interface ModelManifest {
  id: string;
  name: string;
  description: string;
  license: string;
  licenseType: 'Commercial-Friendly' | 'Non-Commercial' | 'Restricted';
  sizeBytes: number;
  sizeFormatted: string;
  inputResolution: [number, number];
  url?: string;
  sha256?: string;
  enabled: boolean;
  notes?: string;
}

export const RMBG2_MANIFEST: ModelManifest = {
  id: 'rmbg-2.0',
  name: 'BRIA RMBG 2.0',
  description: 'Bria AI background removal model (Disabled: Non-commercial license & heavy weight)',
  license: 'Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0)',
  licenseType: 'Non-Commercial',
  sizeBytes: 176 * 1024 * 1024,
  sizeFormatted: '~176 MB (FP16) / 348 MB (FP32)',
  inputResolution: [1024, 1024],
  enabled: ENABLE_RMBG,
  notes: 'معطّل: ترخيص غير تجاري وتعارض بالحجم بين النسخ'
};
