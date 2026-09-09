export interface RMBG2ModelManifest {
  modelId: string;
  modelName: string;
  version: string;
  urls: string[];
  expectedSizeBytes: number;
  expectedSha256: string;
  inputName: string;
  inputShape: [number, number, number, number]; // [N, C, H, W] = [1, 3, 1024, 1024]
  inputType: 'float32';
  outputName: string;
  outputShape: [number, number, number, number]; // [1, 1, 1024, 1024]
  outputType: 'float32';
  mean: [number, number, number];
  std: [number, number, number];
}

export const RMBG2_MANIFEST: RMBG2ModelManifest = {
  modelId: "rmbg-2.0",
  modelName: "BRIA RMBG-2.0 ONNX Vision Model",
  version: "2.0.0",
  urls: [
    "https://huggingface.co/yamura4/RMBG-2.0-ONNX/resolve/main/onnx/model_quantized.onnx",
    "https://huggingface.co/kn4666/bria-rmbg-2.0-web/resolve/main/onnx/model_quantized.onnx",
    "https://huggingface.co/baby2008/RMBG-2.0-ONNX/resolve/main/onnx/model_quantized.onnx"
  ],
  expectedSizeBytes: 365031399,
  expectedSha256: "966c03623944a302f49f8d309a2527b31058ad050687fd1442c41d28bd13f6c0",
  inputName: "pixel_values",
  inputShape: [1, 3, 1024, 1024],
  inputType: "float32",
  outputName: "output",
  outputShape: [1, 1, 1024, 1024],
  outputType: "float32",
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225]
};
