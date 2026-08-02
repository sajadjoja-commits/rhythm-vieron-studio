import React, { useState, useEffect } from 'react';
import { X, Settings, History, Star, Image as ImageIcon, Video, Save, Share2, RefreshCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { aiManager } from '@/ai/AIManager';
import { ImageGenerationPayload, ImageGenerationResult } from '@/ai/types/ai';
import { toast } from 'sonner';

interface AIImageStudioProps {
  onClose: () => void;
}

const AIImageStudio: React.FC<AIImageStudioProps> = ({ onClose }) => {
  const [prompt, setPrompt] = useState<string>('');
  const [negativePrompt, setNegativePrompt] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [width, setWidth] = useState<number>(1024);
  const [height, setHeight] = useState<number>(1024);
  const [seed, setSeed] = useState<number | null>(null);
  const [guidance, setGuidance] = useState<number>(7);
  const [steps, setSteps] = useState<number>(25);
  const [outputFormat, setOutputFormat] = useState<string>('jpeg');
  const [safetyMode, setSafetyMode] = useState<number>(2);
  const [promptUpsampling, setPromptUpsampling] = useState<boolean>(false);
  const [generationMode, setGenerationMode] = useState<string>('text-to-image');
  const [imageToImageFile, setImageToImageFile] = useState<File | null>(null);
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [model, setModel] = useState<string>('flux-pro-1.1');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]); // Store URLs or base64 of generated images
  const [history, setHistory] = useState<any[]>([]); // Store full generation history
  const [favorites, setFavorites] = useState<any[]>([]); // Store favorite prompts/settings
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [numImages, setNumImages] = useState<number>(1); // For batch generation

  // Placeholder for Prompt Builder states
  const [imageType, setImageType] = useState<string>('');
  const [artStyle, setArtStyle] = useState<string>('');
  const [lighting, setLighting] = useState<string>('');
  const [cameraAngle, setCameraAngle] = useState<string>('');
  const [imageQuality, setImageQuality] = useState<string>('');
  const [colors, setColors] = useState<string>('');
  const [details, setDetails] = useState<string>('');
  const [aspectRatioBuilder, setAspectRatioBuilder] = useState<string>('1:1');
  const [imageSizeBuilder, setImageSizeBuilder] = useState<string>('1024x1024');

  // Placeholder for Styles Library
  const stylesLibrary = [
    'Realistic', 'Cinematic', 'Anime', 'Illustration', '3D', 'Fantasy', 'Portrait', 'Product', 'Logo', 'Concept Art', 'Sketch'
  ];

  // Placeholder for Prompt Templates
  const promptTemplates = [
    { name: 'Sci-Fi City', prompt: 'A futuristic city at night, neon lights, flying cars, cyberpunk style' },
    { name: 'Enchanted Forest', prompt: 'An enchanted forest, glowing mushrooms, ancient trees, magical atmosphere, fantasy art' },
  ];

  useEffect(() => {
    // Update width/height based on aspect ratio
    const [arWidth, arHeight] = aspectRatio.split(':').map(Number);
    if (arWidth && arHeight) {
      const newHeight = Math.round(width * (arHeight / arWidth));
      setHeight(newHeight);
    }
  }, [aspectRatio, width]);

  const handleGenerateImage = async (useCurrentSeed: boolean = false) => {
    setIsGenerating(true);
    setError(null);
    try {
      let imageBase64OrUrl: string | undefined;
      let maskBase64OrUrl: string | undefined;

      if (imageToImageFile) {
        imageBase64OrUrl = await readFileAsBase64(imageToImageFile);
      }
      if (maskFile) {
        maskBase64OrUrl = await readFileAsBase64(maskFile);
      }

      const generationPromises = Array.from({ length: numImages }).map(async (_, index) => {
        const currentSeed = useCurrentSeed && seed !== null ? seed : (seed === null ? Math.floor(Math.random() * 1000000) : seed + index);

        const payload: ImageGenerationPayload = {
          prompt,
          negativePrompt: negativePrompt || undefined,
          width,
          height,
          aspectRatio: aspectRatio === 'custom' ? undefined : aspectRatio,
          seed: currentSeed,
          guidance,
          steps,
          outputFormat: outputFormat as any,
          safetyMode,
          promptUpsampling,
          mode: generationMode as any,
          image: imageBase64OrUrl,
          mask: maskBase64OrUrl,
          model: model as any,
        };

        console.log('Calling AIManager with payload:', payload);
        const result: ImageGenerationResult = await aiManager.generateImage(payload.prompt, payload.aspectRatio, payload);
        if (result.imageUrl) {
          return { ...payload, imageUrl: result.imageUrl, timestamp: new Date().toISOString(), metadata: result.metadata, seed: result.seed };
        } else {
          throw new Error('Image URL not found in result.');
        }
      });

      const newImagesData = await Promise.all(generationPromises);
      const newImageUrls = newImagesData.map(img => img.imageUrl);

      setGeneratedImages(prev => [...newImageUrls, ...prev]);
      setHistory(prev => [...newImagesData, ...prev]);
      setSelectedImage(newImageUrls[0]);
      setSeed(newImagesData[0].seed || null); // Update seed if generated randomly
      toast.success('Image generated successfully!');

    } catch (err: any) {
      console.error('Image generation failed:', err);
      setError(err.message || 'Failed to generate image.');
      toast.error(err.message || 'Failed to generate image.');
    } finally {
      setIsGenerating(false);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleUseInPhotoEditor = () => {
    console.log('Using image in Photo Editor:', selectedImage);
    // Logic to pass selectedImage to Photo Editor
  };

  const handleUseInVideoEditor = () => {
    console.log('Using image in Video Editor:', selectedImage);
    // Logic to pass selectedImage to Video Editor
  };

  const handleSaveImage = () => {
    console.log('Saving image:', selectedImage);
    // Logic to save image
  };

  const handleShareImage = () => {
    console.log('Sharing image:', selectedImage);
    // Logic to share image
  };

  const handleRegenerate = () => {
    console.log('Regenerating image with current settings');
    handleGenerateImage(true); // Re-use the generation logic, preserving seed
  };

  const handleAddToFavorites = (item: any) => {
    setFavorites(prev => [...prev, item]);
    console.log('Added to favorites:', item);
  };

  const buildPrompt = () => {
    let builtPrompt = prompt;
    if (imageType) builtPrompt += `, ${imageType}`;
    if (artStyle) builtPrompt += `, ${artStyle}`;
    if (lighting) builtPrompt += `, ${lighting}`;
    if (cameraAngle) builtPrompt += `, ${cameraAngle}`;
    if (imageQuality) builtPrompt += `, ${imageQuality}`;
    if (colors) builtPrompt += `, ${colors}`;
    if (details) builtPrompt += `, ${details}`;
    setPrompt(builtPrompt);
    setAspectRatio(aspectRatioBuilder);
    const [w, h] = imageSizeBuilder.split('x').map(Number);
    if (w && h) {
      setWidth(w);
      setHeight(h);
    }
  };

  const applyStyleToPrompt = (style: string) => {
    setPrompt(prev => `${prev}, ${style}`);
  };

  const applyTemplateToPrompt = (template: { name: string; prompt: string; }) => {
    setPrompt(template.prompt);
    // Optionally, parse template prompt to pre-fill other builder fields
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-background text-foreground">
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h1 className="text-xl font-bold">AI Image Studio</h1>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel: Prompt Editor & Settings */}
          <ScrollArea className="w-1/3 border-r border-border p-4">
            <div className="space-y-4">
              {/* Prompt Editor */}
              <div>
                <Label htmlFor="prompt">Prompt</Label>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter your creative prompt here..."
                  className="min-h-[100px]"
                />
              </div>
              <div>
                <Label htmlFor="negative-prompt">Negative Prompt (Optional)</Label>
                <Textarea
                  id="negative-prompt"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="What you DON'T want to see..."
                  className="min-h-[60px]"
                />
              </div>

              {/* Prompt Builder */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Prompt Builder</CardTitle>
                  <Button variant="outline" size="sm" onClick={buildPrompt}>Build Prompt</Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Select onValueChange={setImageType} value={imageType}>
                    <SelectTrigger><SelectValue placeholder="Image Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="photo">Photo</SelectItem>
                      <SelectItem value="painting">Painting</SelectItem>
                      <SelectItem value="drawing">Drawing</SelectItem>
                      <SelectItem value="illustration">Illustration</SelectItem>
                      <SelectItem value="3d">3D Render</SelectItem>
                      <SelectItem value="icon">Icon</SelectItem>
                      <SelectItem value="logo">Logo</SelectItem>
                      <SelectItem value="concept_art">Concept Art</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select onValueChange={setArtStyle} value={artStyle}>
                    <SelectTrigger><SelectValue placeholder="Art Style" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="realistic">Realistic</SelectItem>
                      <SelectItem value="cinematic">Cinematic</SelectItem>
                      <SelectItem value="anime">Anime</SelectItem>
                      <SelectItem value="fantasy">Fantasy</SelectItem>
                      <SelectItem value="watercolor">Watercolor</SelectItem>
                      <SelectItem value="oil_painting">Oil Painting</SelectItem>
                      <SelectItem value="cyberpunk">Cyberpunk</SelectItem>
                      <SelectItem value="steampunk">Steampunk</SelectItem>
                      <SelectItem value="abstract">Abstract</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select onValueChange={setLighting} value={lighting}>
                    <SelectTrigger><SelectValue placeholder="Lighting" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="studio_lighting">Studio Lighting</SelectItem>
                      <SelectItem value="dramatic_lighting">Dramatic Lighting</SelectItem>
                      <SelectItem value="natural_light">Natural Light</SelectItem>
                      <SelectItem value="soft_light">Soft Light</SelectItem>
                      <SelectItem value="cinematic_lighting">Cinematic Lighting</SelectItem>
                      <SelectItem value="volumetric_lighting">Volumetric Lighting</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select onValueChange={setCameraAngle} value={cameraAngle}>
                    <SelectTrigger><SelectValue placeholder="Camera Angle" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wide_shot">Wide Shot</SelectItem>
                      <SelectItem value="close_up">Close Up</SelectItem>
                      <SelectItem value="aerial_view">Aerial View</SelectItem>
                      <SelectItem value="eye_level">Eye Level</SelectItem>
                      <SelectItem value="low_angle">Low Angle</SelectItem>
                      <SelectItem value="high_angle">High Angle</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select onValueChange={setImageQuality} value={imageQuality}>
                    <SelectTrigger><SelectValue placeholder="Image Quality" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high_resolution">High Resolution</SelectItem>
                      <SelectItem value="4k">4K</SelectItem>
                      <SelectItem value="8k">8K</SelectItem>
                      <SelectItem value="photorealistic">Photorealistic</SelectItem>
                      <SelectItem value="ultra_detailed">Ultra Detailed</SelectItem>
                      <SelectItem value="masterpiece">Masterpiece</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Colors (e.g., \'vibrant, pastel\')" value={colors} onChange={(e) => setColors(e.target.value)} />
                  <Input placeholder="Details (e.g., \'intricate, highly detailed\')" value={details} onChange={(e) => setDetails(e.target.value)} />
                  <Select onValueChange={setAspectRatioBuilder} value={aspectRatioBuilder}>
                    <SelectTrigger><SelectValue placeholder="Aspect Ratio" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1:1">1:1 (Square)</SelectItem>
                      <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                      <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                      <SelectItem value="4:3">4:3</SelectItem>
                      <SelectItem value="3:4">3:4</SelectItem>
                      <SelectItem value="21:9">21:9 (Ultrawide)</SelectItem>
                      <SelectItem value="9:21">9:21 (Tall)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select onValueChange={setImageSizeBuilder} value={imageSizeBuilder}>
                    <SelectTrigger><SelectValue placeholder="Image Size" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="512x512">512x512</SelectItem>
                      <SelectItem value="768x768">768x768</SelectItem>
                      <SelectItem value="1024x1024">1024x1024</SelectItem>
                      <SelectItem value="1280x720">1280x720 (HD Landscape)</SelectItem>
                      <SelectItem value="720x1280">720x1280 (HD Portrait)</SelectItem>
                      <SelectItem value="1920x1080">1920x1080 (Full HD Landscape)</SelectItem>
                      <SelectItem value="1080x1920">1080x1920 (Full HD Portrait)</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Styles Library */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Styles Library</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {stylesLibrary.map(style => (
                      <Button key={style} variant="outline" size="sm" onClick={() => applyStyleToPrompt(style)}>{style}</Button>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setPrompt("")}>Clear Styles</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Prompt Templates */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Prompt Templates</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {promptTemplates.map((template, index) => (
                      <Button key={index} variant="outline" className="w-full justify-start" onClick={() => applyTemplateToPrompt(template)}>
                        {template.name}
                      </Button>
                    ))}
                    <Button variant="outline" className="w-full justify-start" onClick={() => setPrompt("")}>Clear Template</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Favorites */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Favorites</CardTitle>
                </CardHeader>
                <CardContent>
                  {favorites.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No favorites yet. Click the star icon on a history item to add one.</p>
                  ) : (
                    <div className="space-y-2">
                      {favorites.map((fav, index) => (
                        <div key={index} className="flex items-center justify-between p-2 border rounded-md">
                          <span className="text-sm truncate">{fav.prompt}</span>
                          <div className="flex space-x-1">
                            <Button variant="ghost" size="icon" onClick={() => {
                              setPrompt(fav.prompt);
                              setNegativePrompt(fav.negativePrompt || "");
                              setAspectRatio(fav.aspectRatio || "1:1");
                              setWidth(fav.width || 1024);
                              setHeight(fav.height || 1024);
                              setSeed(fav.seed || null);
                              setGuidance(fav.guidance || 7);
                              setSteps(fav.steps || 25);
                              setOutputFormat(fav.outputFormat || "jpeg");
                              setSafetyMode(fav.safetyMode || 2);
                              setPromptUpsampling(fav.promptUpsampling || false);
                              setGenerationMode(fav.generationMode || "text-to-image");
                              setModel(fav.model || "flux-pro-1.1");
                              toast.info("Favorite settings loaded.");
                            }}><History className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => setFavorites(favorites.filter((_, i) => i !== index))}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Advanced Settings Toggle */}
              <Button variant="ghost" className="w-full justify-between" onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}>
                Advanced Settings {showAdvancedSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>

              {/* Advanced Settings Section */}
              {showAdvancedSettings && (
                <Card className="space-y-4 p-4">
                  <div>
                    <Label htmlFor="aspect-ratio">Aspect Ratio</Label>
                    <Select onValueChange={setAspectRatio} value={aspectRatio}>
                      <SelectTrigger id="aspect-ratio"><SelectValue placeholder="Select aspect ratio" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1:1">1:1 (Square)</SelectItem>
                        <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                        <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                        <SelectItem value="4:3">4:3</SelectItem>
                        <SelectItem value="3:4">3:4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label htmlFor="width">Width</Label>
                      <Input id="width" type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor="height">Height</Label>
                      <Input id="height" type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="seed">Seed (Optional)</Label>
                    <Input id="seed" type="number" value={seed || ''} onChange={(e) => setSeed(Number(e.target.value))} placeholder="Random if empty" />
                    <Button variant="outline" size="sm" onClick={() => setSeed(Math.floor(Math.random() * 1000000))} className="mt-2">Random Seed</Button>
                  </div>
                  <div>
                    <Label htmlFor="output-format">Output Format</Label>
                    <Select onValueChange={(value) => console.log("Output Format:", value)} defaultValue="jpeg">
                      <SelectTrigger id="output-format"><SelectValue placeholder="Select output format" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="jpeg">JPEG</SelectItem>
                        <SelectItem value="png">PNG</SelectItem>
                        <SelectItem value="webp">WEBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="safety-mode">Safety Mode (0-6)</Label>
                    <Slider id="safety-mode" min={0} max={6} step={1} defaultValue={[2]} onValueChange={(val) => console.log("Safety Mode:", val[0])} />
                  </div>
                  <div>
                    <Label htmlFor="prompt-upsampling">Prompt Upsampling</Label>
                    <input type="checkbox" id="prompt-upsampling" className="ml-2" onChange={(e) => console.log("Prompt Upsampling:", e.target.checked)} />
                  </div>
                  <div>
                    <Label htmlFor="mode">Generation Mode</Label>
                    <Select onValueChange={(value) => console.log("Generation Mode:", value)} defaultValue="text-to-image">
                      <SelectTrigger id="mode"><SelectValue placeholder="Select mode" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text-to-image">Text to Image</SelectItem>
                        <SelectItem value="image-to-image">Image to Image</SelectItem>
                        <SelectItem value="inpainting">Inpainting</SelectItem>
                        <SelectItem value="outpainting">Outpainting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Add image/mask upload for img2img/inpainting/outpainting */}
                  {/* Add model selection if needed */}
                  <div>
                    <Label htmlFor="guidance">Guidance Scale ({guidance})</Label>
                    <Slider id="guidance" min={1} max={20} step={0.5} value={[guidance]} onValueChange={(val) => setGuidance(val[0])} />
                  </div>
                  <div>
                    <Label htmlFor="steps">Steps ({steps})</Label>
                    <Slider id="steps" min={10} max={100} step={1} value={[steps]} onValueChange={(val) => setSteps(val[0])} />
                  </div>
                  <div>
                    <Label htmlFor="output-format">Output Format</Label>
                    <Select onValueChange={setOutputFormat} value={outputFormat}>
                      <SelectTrigger id="output-format"><SelectValue placeholder="Select output format" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="jpeg">JPEG</SelectItem>
                        <SelectItem value="png">PNG</SelectItem>
                        <SelectItem value="webp">WEBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="safety-mode">Safety Mode ({safetyMode})</Label>
                    <Slider id="safety-mode" min={0} max={6} step={1} value={[safetyMode]} onValueChange={(val) => setSafetyMode(val[0])} />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="prompt-upsampling" checked={promptUpsampling} onChange={(e) => setPromptUpsampling(e.target.checked)} />
                    <Label htmlFor="prompt-upsampling">Prompt Upsampling</Label>
                  </div>
                  <div>
                    <Label htmlFor="generation-mode">Generation Mode</Label>
                    <Select onValueChange={setGenerationMode} value={generationMode}>
                      <SelectTrigger id="generation-mode"><SelectValue placeholder="Select mode" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text-to-image">Text to Image</SelectItem>
                        <SelectItem value="image-to-image">Image to Image</SelectItem>
                        <SelectItem value="inpainting">Inpainting</SelectItem>
                        <SelectItem value="outpainting">Outpainting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(generationMode === 'image-to-image' || generationMode === 'inpainting' || generationMode === 'outpainting') && (
                    <div className="space-y-2">
                      <Label htmlFor="image-input">Source Image</Label>
                      <Input id="image-input" type="file" accept="image/*" onChange={(e) => setImageToImageFile(e.target.files ? e.target.files[0] : null)} />
                    </div>
                  )}
                  {(generationMode === 'inpainting' || generationMode === 'outpainting') && (
                    <div className="space-y-2">
                      <Label htmlFor="mask-input">Mask Image</Label>
                      <Input id="mask-input" type="file" accept="image/*" onChange={(e) => setMaskFile(e.target.files ? e.target.files[0] : null)} />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="model-select">Model</Label>
                    <Select onValueChange={setModel} value={model}>
                      <SelectTrigger id="model-select"><SelectValue placeholder="Select model" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flux-pro-1.1">FLUX.1 Pro 1.1</SelectItem>
                        <SelectItem value="flux-pro-1.0-fill">FLUX.1 Pro 1.0 Fill</SelectItem>
                        <SelectItem value="flux-pro-1.0-canny">FLUX.1 Pro 1.0 Canny</SelectItem>
                        {/* Add other models if FluxProvider supports them */}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="num-images">Number of Images ({numImages})</Label>
                    <Slider id="num-images" min={1} max={4} step={1} value={[numImages]} onValueChange={(val) => setNumImages(val[0])} />
                  </div>
                  {/* Add more advanced settings as discovered from FluxProvider */} 
                </Card>
              )}

              <Button className="w-full" onClick={() => handleGenerateImage()} disabled={isGenerating}>
                {isGenerating ? 'Generating...' : 'Generate Image'}
              </Button>
              {error && <p className="text-red-500 text-sm mt-2">Error: {error}</p>}
            </div>
          </ScrollArea>

          {/* Right Panel: Image Preview & Results */}
          <div className="flex-1 flex flex-col">
            {/* Main Preview Area */}
            <div className="flex-1 flex items-center justify-center bg-muted/40 p-4 relative">
              {selectedImage ? (
                <img src={selectedImage} alt="Generated" className="max-w-full max-h-full object-contain rounded-lg shadow-lg" />
              ) : isGenerating ? (
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <RefreshCcw className="h-8 w-8 animate-spin mb-2" />
                  <span>Generating image...</span>
                </div>
              ) : (
                <div className="text-muted-foreground">Your generated image will appear here</div>
              )}
              {selectedImage && (
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" onClick={handleUseInPhotoEditor}><ImageIcon className="h-4 w-4" /></Button>
                      </TooltipTrigger>
                      <TooltipContent>Use in Photo Editor</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" onClick={handleUseInVideoEditor}><Video className="h-4 w-4" /></Button>
                      </TooltipTrigger>
                      <TooltipContent>Use in Video Editor</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" onClick={handleSaveImage}><Save className="h-4 w-4" /></Button>
                      </TooltipTrigger>
                      <TooltipContent>Save Image</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" onClick={handleShareImage}><Share2 className="h-4 w-4" /></Button>
                      </TooltipTrigger>
                      <TooltipContent>Share Image</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" onClick={handleRegenerate}><RefreshCcw className="h-4 w-4" /></Button>
                      </TooltipTrigger>
                      <TooltipContent>Regenerate</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>

            {/* Mini Gallery & History/Favorites */}
            <div className="h-[200px] border-t border-border p-4 flex flex-col">
              <Tabs defaultValue="results" className="flex-1 flex flex-col">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="results">Results</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                  <TabsTrigger value="favorites">Favorites</TabsTrigger>
                </TabsList>
                <TabsContent value="results" className="flex-1 overflow-hidden pt-4">
                  <ScrollArea className="h-full w-full">
                    <div className="grid grid-cols-4 gap-2">
                      {generatedImages.map((img, index) => (
                        <div key={index} className="relative group cursor-pointer" onClick={() => setSelectedImage(img)}>
                          <img src={img} alt={`Result ${index + 1}`} className="w-full h-24 object-cover rounded-md border border-transparent group-hover:border-primary transition-colors" />
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-md">
                            <Button variant="ghost" size="icon" className="text-white" onClick={(e) => { e.stopPropagation(); handleAddToFavorites(history[index]); }}>
                              <Star className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="history" className="flex-1 overflow-hidden pt-4">
                  <ScrollArea className="h-full w-full">
                    <div className="space-y-2">
                      {history.map((item, index) => (
                        <Card key={index} className="p-2 flex items-center gap-2">
                          <img src={item.imageUrl} alt="History" className="w-16 h-16 object-cover rounded-md" />
                          <div className="flex-1 text-sm">
                            <p className="truncate font-medium">{item.prompt}</p>
                            <p className="text-muted-foreground text-xs">{new Date(item.timestamp).toLocaleString()}</p>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => setSelectedImage(item.imageUrl)}><ImageIcon className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleAddToFavorites(item)}><Star className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => {
                            setPrompt(item.prompt);
                            setNegativePrompt(item.negativePrompt || '');
                            setAspectRatio(item.aspectRatio || '1:1');
                            setWidth(item.width || 1024);
                            setHeight(item.height || 1024);
                            setSeed(item.seed || null);
                            setGuidance(item.guidance || 7);
                            setSteps(item.steps || 25);
                            setOutputFormat(item.outputFormat || 'jpeg');
                            setSafetyMode(item.safetyMode || 2);
                            setPromptUpsampling(item.promptUpsampling || false);
                            setGenerationMode(item.generationMode || 'text-to-image');
                            setModel(item.model || 'flux-pro-1.1');
                            toast.info('Settings loaded from history.');
                          }}><History className="h-4 w-4" /></Button>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="favorites" className="flex-1 overflow-hidden pt-4">
                  <ScrollArea className="h-full w-full">
                    <div className="space-y-2">
                      {favorites.map((item, index) => (
                        <Card key={index} className="p-2 flex items-center gap-2">
                          <img src={item.imageUrl} alt="Favorite" className="w-16 h-16 object-cover rounded-md" />
                          <div className="flex-1 text-sm">
                            <p className="truncate font-medium">{item.prompt}</p>
                            <p className="text-muted-foreground text-xs">{new Date(item.timestamp).toLocaleString()}</p>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => setSelectedImage(item.imageUrl)}><ImageIcon className="h-4 w-4" /></Button>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIImageStudio;
