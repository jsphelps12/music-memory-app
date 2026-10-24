import type { Metadata } from "next";
import { cache } from "react";
import { Keepsake } from "@/components/Keepsake";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { keepsakeView, parseBook } from "@/lib/occasionBook";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ k?: string | string[] }>;
}

/**
 * The keepsake for guests, from the occasion-book edge function, which
 * checks the link's token. null for every refusal (wrong token, not
 * revealed, "Just us"). One call per request, shared with the metadata.
 */
const loadBook = cache(async (slug: string, token: string) => {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/occasion-book`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ slug, token }),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`occasion-book ${res.status}`);
  return parseBook(await res.json());
});

const tokenOf = (k: string | string[] | undefined) => (typeof k === "string" ? k : "");

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ slug }, { k }] = await Promise.all([params, searchParams]);
  const book = await loadBook(slug, tokenOf(k));
  const title = book ? `${book.occasion.names}: the guest book` : "Soundtracks";
  return {
    title,
    description: "Every song their guests picked, with the photos and the words, played back.",
    // Unlisted: the token in the URL is the key, so keep it out of search
    // and out of the Referer header when someone follows a link away.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: { title, siteName: "Soundtracks" },
  };
}

export default async function KeepsakePage({ params, searchParams }: PageProps) {
  const [{ slug }, { k }] = await Promise.all([params, searchParams]);
  const book = await loadBook(slug, tokenOf(k));

  if (!book) {
    return (
      <main className={s.page}>
        <div className={`${s.column} ${s.narrow}`}>
          <TopBar />
          <h1 className={s.headline}>This link doesn&rsquo;t open a guest book</h1>
          <p className={`${s.body} ${s.lede}`}>
            Check that you have the whole link from the couple&rsquo;s message. If it&rsquo;s right, they may have
            kept the guest book just for the two of them.
          </p>
        </div>
      </main>
    );
  }

  return <Keepsake {...keepsakeView(book)} />;
}
