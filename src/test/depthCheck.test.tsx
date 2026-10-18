
import { describe, it } from "vitest";
import { render, act } from "@testing-library/react";
import EditorScreen from "@/components/EditorScreen";
import { MediaProvider } from "@/context/MediaContext";
import { AdGateProvider } from "@/context/AdGateContext";
import { AIToolsPanel } from "@/components/editor/AIToolsPanel";
import MusicPanel from "@/components/editor/MusicPanel";
import TemplateUseScreen from "@/components/TemplateUseScreen";
import SmartTemplateQuickEditor from "@/components/SmartTemplateQuickEditor";

describe("All Screen Render Depth Check", () => {
  it("mounts screens and checks for Maximum update depth exceeded", async () => {
    let maxDepthError = null;
    const origError = console.error;
    console.error = (...args) => {
      const msg = args.join(" ");
      if (msg.includes("Maximum update depth exceeded")) {
        maxDepthError = msg;
      }
      origError(...args);
    };

    try {
      const { unmount } = render(
        <MediaProvider>
          <AdGateProvider>
            <EditorScreen onBack={() => {}} />
          </AdGateProvider>
        </MediaProvider>
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
      });
      unmount();

      const { unmount: unmount2 } = render(
        <MediaProvider>
          <AdGateProvider>
            <MusicPanel open={true} onClose={() => {}} currentTime={0} />
          </AdGateProvider>
        </MediaProvider>
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
      });
      unmount2();

      const { unmount: unmount3 } = render(
        <MediaProvider>
          <AdGateProvider>
            <AIToolsPanel open={true} onClose={() => {}} mediaType="video" />
          </AdGateProvider>
        </MediaProvider>
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
      });
      unmount3();

      const { unmount: unmount4 } = render(
        <MediaProvider>
          <AdGateProvider>
            <TemplateUseScreen templateId="tpl_test" onBack={() => {}} />
          </AdGateProvider>
        </MediaProvider>
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
      });
      unmount4();

      const { unmount: unmount5 } = render(
        <MediaProvider>
          <AdGateProvider>
            <SmartTemplateQuickEditor onBack={() => {}} onOpenFullEditor={() => {}} />
          </AdGateProvider>
        </MediaProvider>
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
      });
      unmount5();

    } finally {
      console.error = origError;
    }

    if (maxDepthError) {
      throw new Error("MAX DEPTH CAUGHT: " + maxDepthError);
    }
  });
});
