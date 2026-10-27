import { parseSharedMoment } from "@/lib/occasionBook";

/**
 * One shared moment from the occasion-book function. The signature in the
 * link opens only that moment; null for every refusal (wrong signature, not
 * revealed, "Just us", hidden).
 */
export async function fetchSharedMoment(slug: string, entryId: string, sig: string) {
  if (!/^[0-9a-f]{32}$/.test(sig) || !/^[0-9a-f-]{36}$/i.test(entryId)) return null;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/occasion-book`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ slug, entryId, sig }),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`occasion-book ${res.status}`);
  return parseSharedMoment(await res.json());
}
