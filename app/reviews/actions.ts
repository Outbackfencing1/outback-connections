"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidDealType,
  isValidTrustTag,
  type DealTypeSlug,
} from "@/lib/trust";

export type ReviewActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function submitVendorReview(
  _prev: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) {
    return { error: "Please sign in to leave feedback or a review." };
  }

  const listingIdRaw = String(formData.get("listing_id") ?? "").trim();
  const targetUserIdRaw = String(formData.get("target_user_id") ?? "").trim();
  const targetBusinessIdRaw = String(formData.get("target_business_id") ?? "").trim();
  const returnPath = String(formData.get("return_path") ?? "").trim();

  const rating = Number(formData.get("rating") ?? 5);
  const wouldRecommend = String(formData.get("would_recommend") ?? "yes") !== "no";
  const dealTypeRaw = String(formData.get("deal_type") ?? "general").trim();
  const dealType: DealTypeSlug = isValidDealType(dealTypeRaw) ? dealTypeRaw : "general";
  const reviewerNameRaw = String(formData.get("reviewer_display_name") ?? "").trim();
  const reviewerPostcodeRaw = String(formData.get("reviewer_postcode") ?? "").trim();
  const commentRaw = String(formData.get("comment") ?? "").trim();

  const rawTags = formData.getAll("tags").map((t) => String(t).trim());
  const tags = Array.from(new Set(rawTags.filter(isValidTrustTag)));

  const fieldErrors: Record<string, string> = {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    fieldErrors.rating = "Choose a star rating from 1 to 5.";
  }
  if (reviewerNameRaw.length < 2 || reviewerNameRaw.length > 60) {
    fieldErrors.reviewer_display_name = "Enter your name or property/business name (2–60 chars).";
  }
  if (reviewerPostcodeRaw && !/^\d{4}$/.test(reviewerPostcodeRaw)) {
    fieldErrors.reviewer_postcode = "Enter a 4-digit Australian postcode (or leave blank).";
  }
  if (commentRaw.length > 800) {
    fieldErrors.comment = "Keep your written review under 800 characters.";
  }
  if (tags.length === 0 && commentRaw.length < 5) {
    fieldErrors.comment = "Select at least one feedback tag or write a short comment.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please check the highlighted fields.", fieldErrors };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Server configuration error." };
  }

  let targetUserId: string | null = targetUserIdRaw || null;
  let targetBusinessId: string | null = targetBusinessIdRaw || null;
  const listingId: string | null = listingIdRaw || null;

  if (listingId && (!targetUserId && !targetBusinessId)) {
    const { data: l } = await admin
      .from("listings")
      .select("user_id, business_id")
      .eq("id", listingId)
      .maybeSingle();
    if (l) {
      targetUserId = l.user_id ?? null;
      targetBusinessId = l.business_id ?? null;
    }
  }

  if (!targetUserId && !targetBusinessId) {
    return { error: "Could not identify the vendor or operator for this review." };
  }

  if (targetUserId && targetUserId === user.id) {
    return { error: "You cannot leave a review on your own profile or listing." };
  }

  if (listingId) {
    const { data: existing } = await admin
      .from("vendor_reviews")
      .select("id")
      .eq("reviewer_user_id", user.id)
      .eq("listing_id", listingId)
      .maybeSingle();
    if (existing) {
      return { error: "You have already submitted feedback on this listing." };
    }
  }

  const { error: insertErr } = await admin.from("vendor_reviews").insert({
    listing_id: listingId,
    target_user_id: targetUserId,
    target_business_id: targetBusinessId,
    reviewer_user_id: user.id,
    reviewer_display_name: reviewerNameRaw,
    reviewer_postcode: reviewerPostcodeRaw || null,
    rating,
    would_recommend: wouldRecommend,
    deal_type: dealType,
    tags,
    comment: commentRaw || null,
    status: "published",
  });

  if (insertErr) {
    return { error: "Could not save your feedback right now. Please try again." };
  }

  if (returnPath && returnPath.startsWith("/")) {
    revalidatePath(returnPath);
  }
  if (targetUserId) {
    revalidatePath(`/profile/${targetUserId}`);
  }
  if (targetBusinessId) {
    revalidatePath(`/profile/${targetBusinessId}`);
  }

  return { ok: true };
}

export async function replyToVendorReview(
  _prev: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) {
    return { error: "Please sign in to reply." };
  }

  const reviewId = String(formData.get("review_id") ?? "").trim();
  const replyText = String(formData.get("vendor_reply") ?? "").trim();
  const returnPath = String(formData.get("return_path") ?? "").trim();

  if (!reviewId) {
    return { error: "Missing review ID." };
  }
  if (replyText.length < 2 || replyText.length > 600) {
    return { error: "Reply must be between 2 and 600 characters." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Server configuration error." };
  }

  const { data: rev } = await admin
    .from("vendor_reviews")
    .select("id, target_user_id, target_business_id")
    .eq("id", reviewId)
    .maybeSingle();

  if (!rev) {
    return { error: "Review not found." };
  }

  let authorised = rev.target_user_id === user.id;
  if (!authorised && rev.target_business_id) {
    const { data: biz } = await admin
      .from("businesses")
      .select("claimed_by")
      .eq("id", rev.target_business_id)
      .maybeSingle();
    if (biz?.claimed_by === user.id) {
      authorised = true;
    }
  }

  if (!authorised) {
    return { error: "Only the profile or listing owner can reply to this review." };
  }

  const { error: updErr } = await admin
    .from("vendor_reviews")
    .update({
      vendor_reply: replyText,
      vendor_replied_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (updErr) {
    return { error: "Could not save reply." };
  }

  if (returnPath && returnPath.startsWith("/")) {
    revalidatePath(returnPath);
  }
  if (rev.target_user_id) {
    revalidatePath(`/profile/${rev.target_user_id}`);
  }

  return { ok: true };
}
