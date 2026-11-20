import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import { TopBar, formatMomentDate, moodLabel } from "@/components/Share";
import { GiftClipboardWriter } from "./GiftClipboardWriter";
import { AppHandoff } from "./AppHandoff";
import { Preview } from "./Preview";
import { fetchSharedMoment } from "./data";
import m from "./moment.module.css";

export const dynamic = "force-dynamic";

const APP_STORE_ID = "6759203604";

interface PageProps {
  params: Promise<{ share_token: string }>;
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF7F2" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0B0A" },
  ],
};

/**
 * The link preview (Messages, Slack, social cards) shows the artwork and
 * names the song; the sender's words stay on the page. Whoever holds the
 * link can read them, but a preview gets pasted into group chats and
 * screenshotted out of context.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { share_token } = await params;
  const moment = await fetchSharedMoment(share_token).catch(() => null);
  // A private link: never indexed, found or not.
  const robots = { index: false, follow: false };
  if (!moment) return { title: "Soundtracks", robots };

  const title = moment.artist ? `${moment.title} · ${moment.artist}` : moment.title;
  const who = moment.sender ?? "Someone";
  const description = moment.words
    ? `${who} shared this song and what it means to them.`
    : `${who} shared this song with you.`;
  const url = `/m/${share_token}`;
  const image = moment.artwork
    ? { url: moment.artwork(1200), width: 1200, height: 1200, alt: `Album artwork for ${moment.title}` }
    : null;

  return {
    title,
    description,
    robots,
    alternates: { canonical: url },
    // Safari's Smart App Banner: "Open" when the app is installed (with this
    // link as the argument), "Get" when it isn't. Native, dismissable, and
    // above the page rather than over it.
    itunes: { appId: APP_STORE_ID, appArgument: `https://soundtracks.app${url}` },
    openGraph: {
      title,
      description,
      url,
      siteName: "Soundtracks",
      type: "website",
      images: image ? [image] : [],
    },
    twitter: {
      // Square artwork: the large card would crop it to a strip.
      card: "summary",
      title,
      description,
      images: image ? [image] : [],
    },
  };
}

export default async function SharedMomentPage({ params }: PageProps) {
  const { share_token } = await params;
  const moment = await fetchSharedMoment(share_token);
  if (!moment) notFound();

  const ua = (await headers()).get("user-agent") ?? "";
  const serverIOS = /iPhone|iPad|iPod/.test(ua);

  const date = formatMomentDate(moment.date);
  const mood = moodLabel(moment.mood);
  const art = moment.artwork;
  const photoCount = moment.photos.length;
  const byline = [moment.sender ? `From ${moment.sender}` : null, date].filter(Boolean).join(" · ");

  return (
    <main className={m.page}>
      <GiftClipboardWriter shareToken={share_token} />

      {/* The app's entry screen: the cover, blurred, as the light behind the
          song. Decoration only; the artwork itself sits sharp on top. */}
      {art && (
        <div className={m.ambient} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art(100)} alt="" />
        </div>
      )}

      <div className={m.frame}>
        <TopBar />

        <article className={m.layout}>
          <div className={m.sleeve}>
            {art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={m.artwork}
                src={art(600)}
                srcSet={`${art(600)} 600w, ${art(1000)} 1000w`}
                sizes="(min-width: 900px) 460px, calc(100vw - 40px)"
                width={600}
                height={600}
                alt={`Album artwork for ${moment.title}`}
                fetchPriority="high"
              />
            ) : (
              <div className={m.artworkBlank} role="img" aria-label={`No artwork for ${moment.title}`}>
                <span className={m.disc} />
              </div>
            )}
          </div>

          <div className={m.notes}>
            <header>
              <h1 className={m.song}>{moment.title}</h1>
              {moment.artist && <p className={m.artist}>{moment.artist}</p>}
            </header>

            {moment.previewUrl && (
              <Preview url={moment.previewUrl} title={moment.title} artist={moment.artist} artwork={art ? art(600) : null} />
            )}

            {moment.words ? (
              <figure className={m.words}>
                <blockquote className={m.reading}>{moment.words}</blockquote>
                {(byline || mood) && (
                  <figcaption className={m.byline}>
                    {byline}
                    {mood && <span className={m.mood}>{byline ? ` · ${mood}` : mood}</span>}
                  </figcaption>
                )}
              </figure>
            ) : (
              (byline || mood) && (
                <p className={`${m.byline} ${m.bylineAlone}`}>
                  {byline}
                  {mood && <span className={m.mood}>{byline ? ` · ${mood}` : mood}</span>}
                </p>
              )
            )}

            {photoCount > 0 && (
              <section className={m.photosSection} aria-labelledby="photos-heading">
                <h2 id="photos-heading" className={m.visuallyHidden}>
                  {photoCount === 1 ? "Photo" : "Photos"}
                </h2>
                {photoCount === 1 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={m.photoSingle}
                    src={moment.photos[0]}
                    alt={moment.sender ? `Photo from ${moment.sender}` : "Photo from this moment"}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  // A swipeable strip at each photo's own shape; it scrolls
                  // with the keyboard too (focusable region).
                  <ul className={m.strip} tabIndex={0} aria-label={`${photoCount} photos, scroll sideways for more`}>
                    {moment.photos.map((src, i) => (
                      <li key={src} className={m.stripItem}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={`Photo ${i + 1} of ${photoCount}${moment.sender ? ` from ${moment.sender}` : ""}`}
                          loading={i < 2 ? "eager" : "lazy"}
                          decoding="async"
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <AppHandoff token={share_token} serverIOS={serverIOS} />
          </div>
        </article>
      </div>
    </main>
  );
}
