import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Phone } from "../_landing/Phone";
import { Lockup, RecordMark } from "../_landing/RecordMark";
import landing from "../_landing/landing.module.css";
import { ReserveForm } from "./ReserveForm";
import s from "./weddings.module.css";

export const metadata: Metadata = {
  title: "A song guest book for your wedding · Soundtracks",
  description:
    "Guests scan a code on their table, pick a song for you and add their name. You keep the soundtrack of your wedding: a page that plays it back, a playlist, and a print for your wall.",
  openGraph: {
    title: "Every guest picks a song for you",
    description: "A song guest book for your wedding, from Soundtracks.",
  },
};

// The print in the hero: a demo wedding, drawn the way the real one is laid
// out (the back of a record sleeve, one line per guest).
const TRACKS = [
  ["September", "Mara"],
  ["Dancing Queen", "Aunt Linda"],
  ["Lovely Day", "Dev"],
  ["Dreams", "Hannah"],
  ["Moon River", "Grandpa Joe"],
  ["Mr. Brightside", "Kyle"],
  ["Golden Hour", "Jess"],
  ["Ho Hey", "Ben"],
  ["Let’s Stay Together", "Nana"],
  ["Yellow", "Theo"],
  ["Valerie", "Ana"],
  ["Africa", "Uncle Rob"],
  ["Can’t Help Falling in Love", "Mom"],
  ["Electric Feel", "Luis"],
  ["Rivers and Roads", "Claire"],
  ["Sweet Caroline", "Table 9"],
];

const SUGGESTED = [
  { art: "/art/september-160.jpg", song: "September", artist: "Earth, Wind & Fire" },
  { art: "/art/dancing-queen-160.jpg", song: "Dancing Queen", artist: "ABBA" },
  { art: "/art/lovely-day-160.jpg", song: "Lovely Day", artist: "Bill Withers" },
  { art: "/art/dreams-160.jpg", song: "Dreams", artist: "Fleetwood Mac" },
];

const KEEPSAKE = [
  {
    title: "A page that plays your night back",
    body: "Every guest’s song, name, words and photo, in the order they came in. It plays through like a radio show: full songs if you have Apple Music, 30-second previews if you don’t. Send it to everyone who was there.",
  },
  {
    title: "The playlist",
    body: "Every song in one playlist, saved to Apple Music or Spotify in a tap.",
  },
  {
    title: "Everything, kept",
    body: "Every note as a PDF and every photo in one download, named and in order.",
  },
  {
    title: "Every anniversary",
    body: "A year from the night, it comes back: “One year ago tonight, Mara picked September.”",
  },
];

const EXTRAS = [
  {
    title: "The tracklist print",
    body: "Your wedding as the back of a record sleeve: every song and the guest who picked it, with a code that plays it. 18 × 24 in.",
    price: "$49 · framed $129",
  },
  {
    title: "Thank-you cards",
    body: "One for every guest, printed with the song they picked and a code that plays it. Envelopes included.",
    price: "$2.50 a card",
  },
  {
    title: "The liner-notes book",
    body: "A hardcover with a page for every guest: their song, their words, their photo.",
    price: "$119",
  },
];

const FAQ = [
  {
    q: "Do our guests need an app?",
    a: "No. They scan the code on their table, or open the link you send, and it works in their phone’s browser. No account, nothing to install.",
  },
  {
    q: "Why do guests have to add their name?",
    a: "So every song on your print, your cards and your page says who picked it. A song without a name is just a playlist.",
  },
  {
    q: "Do the songs play in full?",
    a: "On the keepsake page, yes, for anyone with Apple Music. Everyone else hears a 30-second preview of each song, then the next one.",
  },
  {
    q: "Can we take something out?",
    a: "Yes. You see every song before anything is shared or printed, and you can hide any of them.",
  },
  {
    q: "When do we get it?",
    a: "Guests can add songs from the day of the wedding until two weeks after. Your page is ready as soon as you close it; prints and cards ship after you approve the proofs.",
  },
];

async function playQr() {
  return QRCode.toString("https://soundtracks.app/weddings", {
    type: "svg",
    margin: 0,
    color: { dark: "#23222B", light: "#0000" },
  });
}

export default async function WeddingsPage() {
  const qr = await playQr();

  return (
    <main className={`${landing.page} ${s.page}`}>
      <section className={s.hero}>
        <header className={s.nav}>
          <Link href="/" className={landing.wordmark}>
            <Lockup />
          </Link>
          <a href="#reserve" className={s.navLink}>
            Reserve your date
          </a>
        </header>

        <div className={s.heroInner}>
          <div className={s.heroCopy}>
            <h1 className={s.heroTitle}>Every guest picks a song for you.</h1>
            <p className={s.heroLede}>
              They scan a code on their table, pick a song and add their name, with a few words or a photo if they
              like. You keep the soundtrack of your wedding, in their words: a page that plays it back, and a print for
              your wall.
            </p>
            <a href="#reserve" className={s.button}>
              Reserve your date
            </a>
            <p className={s.fine}>Opening for 2027 weddings. Nothing to pay now.</p>
          </div>

          <figure className={s.frame} aria-label="A tracklist print: Sam and Priya, June 14, 2027, sixteen songs, each with the guest who picked it">
            <div className={s.mat}>
              <div className={s.print}>
                <div className={s.printHead}>
                  <p className={s.printNames}>Sam &amp; Priya</p>
                  <p className={s.printMeta}>June 14, 2027 · Hudson, New York</p>
                </div>
                <div className={s.sides}>
                  {[TRACKS.slice(0, 8), TRACKS.slice(8)].map((side, si) => (
                    <ol key={si} className={s.side} start={si * 8 + 1}>
                      <li className={s.sideLabel} aria-hidden="true">
                        Side {si === 0 ? "A" : "B"}
                      </li>
                      {side.map(([song, by]) => (
                        <li key={song}>
                          <span className={s.trackSong}>{song}</span>
                          <span className={s.trackBy}>{by}</span>
                        </li>
                      ))}
                    </ol>
                  ))}
                </div>
                <div className={s.printFoot}>
                  <RecordMark size={34} grooves={false} />
                  <p>
                    87 songs from 112 guests
                    <br />
                    Scan to play
                  </p>
                  <span className={s.qr} dangerouslySetInnerHTML={{ __html: qr }} />
                </div>
              </div>
            </div>
          </figure>
        </div>
      </section>

      <section className={s.guests} aria-labelledby="guests-title">
        <div className={s.guestsCopy}>
          <h2 id="guests-title" className={s.sectionTitle}>
            Thirty seconds, or as long as they like.
          </h2>
          <p className={s.body}>
            Scan the code, tap a song, add their name. That&rsquo;s all it takes, so even the guest with a drink in each
            hand does it. The ones with more to say write a few lines about you and add a photo from the night, and
            those end up on your page, your cards and your book.
          </p>
          <p className={s.body}>
            You choose a handful of suggestions for the top of the list, and anyone can search for anything else. No app,
            no account.
          </p>
        </div>
        <div className={s.guestsPhone}>
          <Phone>
            <div className={s.guestScreen}>
              <p className={s.gTitle}>Sam &amp; Priya</p>
              <p className={s.gSub}>Pick a song for them</p>
              <div className={s.gSearch}>Search for a song</div>
              <p className={s.gLabel}>Suggested by Sam &amp; Priya</p>
              <ul className={s.gList}>
                {SUGGESTED.map((t, i) => (
                  <li key={t.song} className={i === 0 ? s.gPicked : undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.art} alt="" width={80} height={80} />
                    <span>
                      <b>{t.song}</b>
                      {t.artist}
                    </span>
                    {i === 0 ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className={s.gName}>Mara</div>
              <div className={s.gNote}>Boulder, windows down, the summer you two met&hellip;</div>
              <div className={s.gPhoto}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                Add a photo
              </div>
              <div className={s.gButton}>Add my song</div>
            </div>
          </Phone>
        </div>
      </section>

      <section className={s.keepsake} aria-labelledby="keepsake-title">
        <div className={s.priceHead}>
          <h2 id="keepsake-title" className={s.sectionTitle}>
            What you keep.
          </h2>
          <p className={s.price}>$79</p>
        </div>
        <ul className={s.rows}>
          {KEEPSAKE.map((k) => (
            <li key={k.title}>
              <h3 className={s.rowTitle}>{k.title}</h3>
              <p className={s.body}>{k.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.extras} aria-labelledby="extras-title">
        <h2 id="extras-title" className={s.sectionTitle}>
          Something to hold.
        </h2>
        <ul className={s.rows}>
          {EXTRAS.map((x) => (
            <li key={x.title} className={s.priced}>
              <h3 className={s.rowTitle}>{x.title}</h3>
              <p className={s.body}>{x.body}</p>
              <p className={s.rowPrice}>{x.price}</p>
            </li>
          ))}
          <li className={`${s.priced} ${s.bundle}`}>
            <h3 className={s.rowTitle}>The whole album</h3>
            <p className={s.body}>The keepsake, the framed print and the book. A gift from parents or the wedding party.</p>
            <p className={s.rowPrice}>$279</p>
          </li>
        </ul>
      </section>

      <section id="reserve" className={s.reserve} aria-labelledby="reserve-title">
        <div className={s.reserveCopy}>
          <h2 id="reserve-title" className={s.sectionTitle}>
            Reserve your date.
          </h2>
          <p className={s.body}>
            We&rsquo;re opening for 2027 weddings. Tell us your date and we&rsquo;ll be in touch to set it up well
            before the day. Nothing is charged now.
          </p>
        </div>
        <ReserveForm />
      </section>

      <section className={s.faq} aria-labelledby="faq-title">
        <h2 id="faq-title" className={s.sectionTitle}>
          Questions.
        </h2>
        <div className={s.faqList}>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p className={s.body}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className={landing.footer}>
        <span>© {new Date().getFullYear()} Soundtracks</span>
        <nav aria-label="Legal">
          <Link href="/">Soundtracks</Link>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="mailto:founder@soundtracks.app">Contact</a>
        </nav>
      </footer>
    </main>
  );
}
