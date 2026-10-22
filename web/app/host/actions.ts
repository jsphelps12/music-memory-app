"use server";

import { redirect } from "next/navigation";
import { getHostSupabase } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await getHostSupabase();
  await supabase.auth.signOut();
  redirect("/host/sign-in");
}
