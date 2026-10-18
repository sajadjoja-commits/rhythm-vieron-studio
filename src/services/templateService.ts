import { supabase } from "@/integrations/supabase/client";
import { PublishedTemplate, EditableProjectData } from "@/types/template";

const LOCAL_STORAGE_KEY = "vireon_published_templates_v1";
const VIEWED_SESSION_PREFIX = "vireon_tpl_viewed_";

export const DEFAULT_PUBLIC_WEB_URL = "https://rhythm-vieron-studio.lovable.app";

export type PublishTemplateResult = PublishedTemplate & {
  template: PublishedTemplate;
  remote: boolean;
  remoteError?: string;
};

async function getAuthenticatedUser() {
  try {
    if (typeof supabase.auth?.getUser === "function") {
      const res = await supabase.auth.getUser();
      if (res?.data?.user) return res.data.user;
    }
    if (typeof supabase.auth?.getSession === "function") {
      const res = await supabase.auth.getSession();
      if (res?.data?.session?.user) return res.data.session.user;
    }
  } catch (err) {
    console.warn("Supabase auth check warning:", err);
  }
  return null;
}

export async function incrementTemplateViews(templateId: string): Promise<boolean> {
  if (!templateId) return false;
  const sessionKey = `${VIEWED_SESSION_PREFIX}${templateId}`;

  try {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(sessionKey) === "1") {
      return false;
    }

    const user = await getAuthenticatedUser();
    if (!user) {
      return false;
    }

    if (typeof sessionStorage !== "undefined") {
      if (sessionStorage.getItem(sessionKey) === "1") {
        return false;
      }
      sessionStorage.setItem(sessionKey, "1");
    }

    const { error } = await supabase.rpc("increment_template_views" as any, {
      p_template_id: templateId,
    } as any);

    if (error) {
      console.warn("Supabase increment_template_views warning:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Supabase increment_template_views error:", err);
    return false;
  }
}

export async function incrementTemplateUses(templateId: string): Promise<boolean> {
  if (!templateId) return false;

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return false;
    }

    const { error } = await supabase.rpc("increment_template_uses" as any, {
      p_template_id: templateId,
    } as any);

    if (error) {
      console.warn("Supabase increment_template_uses warning:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Supabase increment_template_uses error:", err);
    return false;
  }
}

export async function publishTemplateToSupabase(
  title: string,
  hashtags: string[],
  coverUrl: string,
  projectData: EditableProjectData
): Promise<PublishTemplateResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Login required to publish templates");
  }

  const newTemplate: PublishedTemplate = {
    id: `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    user_id: user.id,
    title: title.trim() || "Untitled Template",
    hashtags: hashtags.map(h => h.startsWith("#") ? h : `#${h}`).slice(0, 5),
    cover_url: coverUrl || "",
    creator_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Vireon Creator",
    created_at: new Date().toISOString(),
    views_count: 0,
    uses_count: 0,
    project_data: projectData,
  };

  // 1. Save locally for instant offline/online availability
  saveTemplateLocally(newTemplate);

  // 2. Attempt remote Supabase publish (do not send created_at, creator_email, views_count, or uses_count)
  try {
    const { data, error } = await supabase
      .from("templates" as any)
      .insert({
        id: newTemplate.id,
        user_id: newTemplate.user_id,
        title: newTemplate.title,
        hashtags: newTemplate.hashtags,
        cover_url: newTemplate.cover_url,
        creator_name: newTemplate.creator_name,
        project_data: newTemplate.project_data,
      } as any)
      .select()
      .single();

    if (error) {
      console.warn("Supabase templates insert warning (saved locally only):", error);
      const reason = error.message || error.details || "فشل الحفظ في الخادم";
      return {
        ...newTemplate,
        template: newTemplate,
        remote: false,
        remoteError: reason,
      };
    } else if (data) {
      const merged: PublishedTemplate = {
        ...newTemplate,
        ...(data as any),
      };
      saveTemplateLocally(merged);
      return {
        ...merged,
        template: merged,
        remote: true,
      };
    }
  } catch (err: any) {
    console.warn("Supabase templates request error:", err);
    const reason = err?.message || "تعذر الاتصال بالخادم";
    return {
      ...newTemplate,
      template: newTemplate,
      remote: false,
      remoteError: String(reason),
    };
  }

  return {
    ...newTemplate,
    template: newTemplate,
    remote: false,
    remoteError: "لم يتم تأكيد النشر من الخادم",
  };
}

export async function fetchPublishedTemplates(): Promise<PublishedTemplate[]> {
  const localList = getLocalTemplates();

  try {
    const { data, error } = await supabase
      .from("templates" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data && Array.isArray(data) && data.length > 0) {
      const mergedMap = new Map<string, PublishedTemplate>();
      localList.forEach(t => mergedMap.set(t.id, t));
      data.forEach((item: any) => {
        mergedMap.set(item.id, {
          id: item.id,
          user_id: item.user_id,
          title: item.title,
          hashtags: item.hashtags || [],
          cover_url: item.cover_url,
          creator_name: item.creator_name || "Creator",
          creator_email: item.creator_email || "",
          created_at: item.created_at,
          views_count: item.views_count || 0,
          uses_count: item.uses_count || 0,
          project_data: item.project_data,
        });
      });
      return Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
  } catch (err) {
    console.warn("Failed fetching remote templates:", err);
  }

  return localList;
}

export async function fetchTemplateById(id: string): Promise<PublishedTemplate | null> {
  const localList = getLocalTemplates();
  const foundLocal = localList.find(t => t.id === id);

  try {
    const { data, error } = await supabase
      .from("templates" as any)
      .select("*")
      .eq("id", id)
      .single();

    if (!error && data) {
      const d = data as any;
      const remoteTemplate: PublishedTemplate = {
        id: d.id,
        user_id: d.user_id,
        title: d.title,
        hashtags: d.hashtags || [],
        cover_url: d.cover_url,
        creator_name: d.creator_name || "Creator",
        creator_email: d.creator_email || "",
        created_at: d.created_at,
        views_count: d.views_count || 0,
        uses_count: d.uses_count || 0,
        project_data: d.project_data,
      };
      saveTemplateLocally(remoteTemplate);
      await incrementTemplateViews(remoteTemplate.id);
      return remoteTemplate;
    }
  } catch (err) {
    console.warn("Failed fetching remote template by ID:", err);
  }

  if (foundLocal) {
    await incrementTemplateViews(foundLocal.id);
    return foundLocal;
  }

  return null;
}

export function generateTemplateShareUrl(templateId: string): string {
  const envUrl = import.meta.env.VITE_PUBLIC_WEB_URL;
  const rawBase =
    typeof envUrl === "string" && envUrl.trim().length > 0
      ? envUrl.trim()
      : DEFAULT_PUBLIC_WEB_URL;
  const base = rawBase.replace(/\/+$/, "");
  return `${base}/?templateId=${encodeURIComponent(templateId)}`;
}

export async function deletePublishedTemplate(id: string): Promise<boolean> {
  // 1. Remove from local storage
  try {
    const current = getLocalTemplates();
    const updated = current.filter(t => t.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Local storage delete error:", e);
  }

  // 2. Remove from Supabase if possible
  try {
    const { error } = await supabase
      .from("templates" as any)
      .delete()
      .eq("id", id);
    if (error) {
      console.warn("Supabase template delete warning:", error);
    }
  } catch (err) {
    console.warn("Failed remote delete template:", err);
  }

  return true;
}

// Local Storage Helpers
function getLocalTemplates(): PublishedTemplate[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTemplateLocally(template: PublishedTemplate) {
  try {
    const current = getLocalTemplates();
    const updated = [template, ...current.filter(t => t.id !== template.id)];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Local storage error:", e);
  }
}
