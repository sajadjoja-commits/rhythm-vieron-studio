import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_PUBLIC_WEB_URL,
  generateTemplateShareUrl,
  publishTemplateToSupabase,
  fetchTemplateById,
  incrementTemplateViews,
  incrementTemplateUses,
} from "@/services/templateService";
import type { EditableProjectData } from "@/types/template";

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();
const mockInsertSingle = vi.fn();
const mockInsertSelect = vi.fn(() => ({ single: mockInsertSingle }));
const mockInsert = vi.fn(() => ({ select: mockInsertSelect }));
const mockSelectSingle = vi.fn();
const mockSelectEq = vi.fn(() => ({ single: mockSelectSingle }));
const mockSelect = vi.fn(() => ({ eq: mockSelectEq }));
const mockFrom = vi.fn(() => ({
  insert: mockInsert,
  select: mockSelect,
}));
const mockRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: (...args: any[]) => mockGetUser(...args),
      getSession: (...args: any[]) => mockGetSession(...args),
    },
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

const sampleProjectData: EditableProjectData = {
  clips: [],
  captions: [],
  overlays: [],
  audioTracks: [],
  filters: [],
  vfx: [],
  totalDuration: 15,
  allowTextEditing: true,
  allowMusicMuting: true,
};

describe("templateService unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    localStorage.clear();
    sessionStorage.clear();

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user_123",
          email: "creator@example.com",
          user_metadata: { full_name: "Test Creator" },
        },
      },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("(أ) generateTemplateShareUrl with and without VITE_PUBLIC_WEB_URL", () => {
    it("uses DEFAULT_PUBLIC_WEB_URL when VITE_PUBLIC_WEB_URL is not set", () => {
      vi.stubEnv("VITE_PUBLIC_WEB_URL", "");
      const url = generateTemplateShareUrl("tpl_abc 123");
      expect(DEFAULT_PUBLIC_WEB_URL).toBe("https://rhythm-vieron-studio.lovable.app");
      expect(url).toBe("https://rhythm-vieron-studio.lovable.app/?templateId=tpl_abc%20123");
    });

    it("uses VITE_PUBLIC_WEB_URL when provided and strips trailing slashes", () => {
      vi.stubEnv("VITE_PUBLIC_WEB_URL", "https://custom.vireon.app///");
      const url = generateTemplateShareUrl("tpl_999");
      expect(url).toBe("https://custom.vireon.app/?templateId=tpl_999");
    });
  });

  describe("(ب) publishTemplateToSupabase remote failure vs success and payload sanitization", () => {
    it("returns remote: false when remote insert fails, still saves locally, and omits forbidden fields from payload", async () => {
      mockInsertSingle.mockResolvedValue({
        data: null,
        error: { message: "RLS policy violation" },
      });

      const result = await publishTemplateToSupabase(
        "My Test Template",
        ["vireon", "#cut"],
        "https://example.com/cover.jpg",
        sampleProjectData
      );

      expect(result.remote).toBe(false);
      expect(result.remoteError).toContain("RLS policy violation");

      // Saved locally despite remote failure
      const localRaw = localStorage.getItem("vireon_published_templates_v1");
      expect(localRaw).toBeTruthy();
      const localList = JSON.parse(localRaw!);
      expect(localList.length).toBe(1);
      expect(localList[0].id).toBe(result.id);

      // Verify insert payload omits created_at, creator_email, views_count, uses_count
      expect(mockInsert).toHaveBeenCalledTimes(1);
      const insertedPayload = (mockInsert.mock.calls[0] as any[])[0];
      expect(insertedPayload).toHaveProperty("id");
      expect(insertedPayload).toHaveProperty("user_id", "user_123");
      expect(insertedPayload).toHaveProperty("title", "My Test Template");
      expect(insertedPayload).toHaveProperty("hashtags", ["#vireon", "#cut"]);
      expect(insertedPayload).toHaveProperty("cover_url", "https://example.com/cover.jpg");
      expect(insertedPayload).toHaveProperty("creator_name", "Test Creator");
      expect(insertedPayload).toHaveProperty("project_data");
      expect(insertedPayload).not.toHaveProperty("created_at");
      expect(insertedPayload).not.toHaveProperty("creator_email");
      expect(insertedPayload).not.toHaveProperty("views_count");
      expect(insertedPayload).not.toHaveProperty("uses_count");
    });

    it("returns remote: true when Supabase insert succeeds", async () => {
      mockInsertSingle.mockImplementation(async () => ({
        data: {
          id: "tpl_server_1",
          user_id: "user_123",
          title: "My Test Template",
          hashtags: ["#vireon"],
          cover_url: "",
          creator_name: "Test Creator",
          created_at: "2026-10-06T00:00:00Z",
          views_count: 0,
          uses_count: 0,
          project_data: sampleProjectData,
        },
        error: null,
      }));

      const result = await publishTemplateToSupabase(
        "My Test Template",
        ["#vireon"],
        "",
        sampleProjectData
      );

      expect(result.remote).toBe(true);
      expect(result.remoteError).toBeUndefined();
    });
  });

  describe("(ج) Template view & use counters (session deduplication & auth guard)", () => {
    it("calls increment_template_views RPC only once per template per session for logged-in user", async () => {
      const first = await incrementTemplateViews("tpl_view_1");
      const second = await incrementTemplateViews("tpl_view_1");
      const differentTpl = await incrementTemplateViews("tpl_view_2");

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(differentTpl).toBe(true);

      expect(mockRpc).toHaveBeenCalledTimes(2);
      expect(mockRpc).toHaveBeenNthCalledWith(1, "increment_template_views", {
        p_template_id: "tpl_view_1",
      });
      expect(mockRpc).toHaveBeenNthCalledWith(2, "increment_template_views", {
        p_template_id: "tpl_view_2",
      });
    });

    it("triggers increment_template_views once per session when fetchTemplateById succeeds", async () => {
      mockSelectSingle.mockResolvedValue({
        data: {
          id: "tpl_fetched_1",
          user_id: "user_123",
          title: "Fetched",
          hashtags: [],
          cover_url: "",
          creator_name: "Creator",
          created_at: "2026-10-06T00:00:00Z",
          views_count: 7,
          uses_count: 3,
          project_data: sampleProjectData,
        },
        error: null,
      });

      const tpl1 = await fetchTemplateById("tpl_fetched_1");
      const tpl2 = await fetchTemplateById("tpl_fetched_1");

      expect(tpl1?.views_count).toBe(7);
      expect(tpl2?.views_count).toBe(7);
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith("increment_template_views", {
        p_template_id: "tpl_fetched_1",
      });
    });

    it("does not call view or use RPCs when user is not logged in", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      const v = await incrementTemplateViews("tpl_guest");
      const u = await incrementTemplateUses("tpl_guest");

      expect(v).toBe(false);
      expect(u).toBe(false);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("calls increment_template_uses for logged-in user and swallows RPC errors silently", async () => {
      const ok = await incrementTemplateUses("tpl_use_1");
      expect(ok).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith("increment_template_uses", {
        p_template_id: "tpl_use_1",
      });

      mockRpc.mockRejectedValueOnce(new Error("Network failure"));
      await expect(incrementTemplateUses("tpl_use_1")).resolves.toBe(false);
    });
  });
});
