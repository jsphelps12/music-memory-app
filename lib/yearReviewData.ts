// Fetch for Year in review (lib/yearInReview.ts holds the pure logic).

import { supabase } from "@/lib/supabase";
import { mapRowToMoment } from "@/lib/moments";
import { YEAR_REVIEW_COLUMNS } from "@/lib/momentColumns";
import { fetchAllRows } from "@/lib/fetchAllRows";
import type { Moment } from "@/types";

/**
 * Every moment that could belong to `year`: by moment date, or by when it
 * was saved when it has no moment date (the same rule buildYearReview uses).
 * Paged, so a year past 1000 moments isn't cut short.
 */
export async function fetchYearReviewMoments(userId: string, year: number): Promise<Moment[]> {
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const [dated, undated] = await Promise.all([
    fetchAllRows<any>((start, end) =>
      supabase
        .from("moments")
        .select(YEAR_REVIEW_COLUMNS)
        .eq("user_id", userId)
        .gte("moment_date", from)
        .lt("moment_date", to)
        .order("id", { ascending: true })
        .range(start, end)
    ),
    fetchAllRows<any>((start, end) =>
      supabase
        .from("moments")
        .select(YEAR_REVIEW_COLUMNS)
        .eq("user_id", userId)
        .is("moment_date", null)
        .gte("created_at", from)
        .lt("created_at", to)
        .order("id", { ascending: true })
        .range(start, end)
    ),
  ]);
  return [...dated, ...undated].map(mapRowToMoment);
}
