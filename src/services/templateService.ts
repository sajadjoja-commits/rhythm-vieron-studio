import { supabase } from "@/integrations/supabase/client";
import { PublishedTemplate, EditableProjectData } from "@/types/template";

const LOCAL_STORAGE_KEY = "vireon_published_templates_v1";

export async function publishTemplateToSupabase(
  title: string,
  hashtags: string[],
  coverUrl: string,
  projectData: EditableProjectData
): Promise<PublishedTemplate> {
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
    creator_email: user.email || "",
    created_at: new Date().toISOString(),
    views_count: 0,
    uses_count: 0,
    project_data: projectData,
  };

  // 1. Save locally for instant offline/online availability
  saveTemplateLocally(newTemplate);

  // 2. Attempt remote Supabase publish
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
        creator_email: newTemplate.creator_email,
        created_at: newTemplate.created_at,
        project_data: newTemplate.project_data,
      } as any)
      .select()
      .single();

    if (error) {
      console.warn("Supabase templates insert warning (using local fallback):", error);
    } else if (data) {
      return {
        ...newTemplate,
        ...(data as unknown as Record<string, any>),
      };
    }
  } catch (err) {
    console.warn("Supabase templates request error:", err);
  }

  return newTemplate;
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
  if (foundLocal) return foundLocal;

  try {
    const { data, error } = await supabase
      .from("templates" as any)
      .select("*")
      .eq("id", id)
      .single();

    if (!error && data) {
      const d = data as unknown as Record<string, any>;
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
      return remoteTemplate;
    }
  } catch (err) {
    console.warn("Failed fetching remote template by ID:", err);
  }

  return null;
}

export function generateTemplateShareUrl(templateId: string): string {
  const origin = window.location.origin + window.location.pathname;
  return `${origin}?templateId=${encodeURIComponent(templateId)}`;
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
