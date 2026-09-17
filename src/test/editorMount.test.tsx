
import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import EditorScreen from "@/components/EditorScreen";
import { MediaProvider } from "@/context/MediaContext";

describe("EditorScreen Render Check", () => {
  it("mounts EditorScreen without infinite loops", async () => {
    const origError = console.error;
    let maxDepthError = null;
    console.error = (...args) => {
      const msg = args.join(" ");
      if (msg.includes("Maximum update depth exceeded")) {
        maxDepthError = msg;
      }
      origError(...args);
    };
    try {
      render(
        <MediaProvider>
          <EditorScreen onBack={() => {}} />
        </MediaProvider>
      );
      await new Promise((r) => setTimeout(r, 400));
    } finally {
      console.error = origError;
    }
    if (maxDepthError) {
      throw new Error("CAUGHT ERROR: " + maxDepthError);
    }
  });
});
