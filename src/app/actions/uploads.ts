"use server";

import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const signedUrlSchema = z.object({
  dormId: z.string().uuid(),
  bucket: z.string().min(1),
  path: z.string().min(1).max(500),
});

export async function createSignedUploadUrl(input: {
  dormId: string;
  bucket: string;
  path: string;
  expiresInSeconds?: number;
}) {
  const parsed = signedUrlSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid signed URL request." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", parsed.data.dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { error: "Forbidden" };
  }

  const pathParts = parsed.data.path.split("/").filter(Boolean);
  if (pathParts.length < 3 || pathParts[1] !== parsed.data.dormId) {
    return { error: "Invalid upload path." };
  }

  const expiresInSeconds =
    typeof input.expiresInSeconds === "number" && input.expiresInSeconds > 0
      ? Math.min(Math.floor(input.expiresInSeconds), 60 * 60)
      : 10 * 60;

  const { data, error } = await supabase.storage
    .from(parsed.data.bucket)
    .createSignedUrl(parsed.data.path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return { error: error?.message ?? "Failed to create signed URL." };
  }

  return { url: data.signedUrl };
}

