import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Phone } from "../_landing/Phone";
import { Lockup, RecordMark } from "../_landing/RecordMark";
import landing from "../_landing/landing.module.css";
import { ReserveForm } from "./ReserveForm";
import s from "./weddings.module.css";

export const metadata: Metadata = {
  title: "A guest book that plays, for your wedding · Soundtracks",
  description:
    "Every guest picks a song for you and says why, with a photo from the night if they have one. You keep a guest book that plays them back.",
  openGraph: {
    title: "A guest book that plays",
    description: "Every guest picks a song for you and says why. From Soundtracks.",
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

// Three pages from a demo guest book: two guests who wrote and added a photo,
// and one who only picked a song (that counts too).
const PAGES = [
  {
    photo: "/photos/wed-dancing-1100.webp",
    art: "/art/september-160.jpg",
    song: "September",
    artist: "Earth, Wind & Fire",
    note: "You two played this in the kitchen the night you got engaged. We could hear it from the street.",
    by: "Mara",
    when: "9:48 PM",
  },
  {
    photo: "/photos/wed-table-1100.webp",
    art: "/art/lovely-day-160.jpg",
    song: "Lovely Day",
    artist: "Bill Withers",
    note: "Every Sunday the summer we all lived on Pine Street.",
    by: "Dev",
    when: "10:15 PM",
  },
  {
    photo: null,
    art: "/art/dancing-queen-160.jpg",
    song: "Dancing Queen",
    artist: "ABBA",
    note: null,
    by: "Aunt Linda",
    when: "10:31 PM",
  },
];

const SUGGESTED = [
  { art: "/art/september-160.jpg", song: "September", artist: "Earth, Wind & Fire" },
  { art: "/art/dancing-queen-160.jpg", song: "Dancing Queen", artist: "ABBA" },
  { art: "/art/lovely-day-160.jpg", song: "Lovely Day", artist: "Bill Withers" },
  { art: "/art/dreams-160.jpg", song: "Dreams", artist: "Fleetwood Mac" },
];

const KEEPSAKE = [
  {
    title: "The guest book that plays",
    body: "Every guest’s song with their words and photo, in the order the night went. Open it and it plays them back, one after another: full songs if you have Apple Music, 30-second previews if you don’t. Send it to everyone who was there.",
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
    body: "A year from the night, it comes back: “One year ago tonight, Mara picked September,” with what she wrote.",
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
    body: "A hardcover with a full page for every guest’s moment: their photo, their song, their words. Song-only picks gather on tracklist pages at the back.",
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
    a: "Guests can add songs and photos from the day of the wedding until two weeks after, with one reminder the week after for the photos. Your page is ready as soon as you close it; prints, cards and the book ship after you approve the proofs.",
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
            <h1 className={s.heroTitle}>A guest book that plays.</h1>
            <p className={s.heroLede}>
              Every guest picks a song for you and tells you why, with a photo from the night if they have one. Years
              from now you&rsquo;ll open it and hear them.
            </p>
            <a href="#reserve" className={s.button}>
              Reserve your date
            </a>
            <p className={s.fine}>Opening for 2027 weddings. Nothing to pay now.</p>
          </div>

          <div className={s.pages} aria-label="Three pages from a guest book">
            {PAGES.map((p, i) => (
              <article key={p.song} className={s.pageCard} data-i={i}>
                {p.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={s.pagePhoto} src={p.photo} alt="" width={1100} height={733} />
                ) : null}
                <div className={s.pageSong}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.art} alt="" width={80} height={80} />
                  <p>
                    <b>{p.song}</b> {p.artist}
                  </p>
                </div>
                {p.note ? <p className={s.pageNote}>{p.note}</p> : null}
                <p className={s.pageBy}>
                  {p.by} · {p.when}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={s.guests} aria-labelledby="guests-title">
        <div className={s.guestsCopy}>
          <h2 id="guests-title" className={s.sectionTitle}>
            Easy for everyone. Room for more.
          </h2>
          <p className={s.body}>
            Scan the code, tap a song, add a photo from tonight and their name. Everyone already has ten photos on
            their phone by the first dance, so it&rsquo;s one more tap. Words are optional, and a tap on &ldquo;The night we
            met&hellip;&rdquo; gets them started.
          </p>
          <p className={s.body}>
            The week after, guests get one note asking for their photos from the night, which land on the song they
            already picked. You choose a handful of song suggestions; anyone can search for anything else. No app, no
            account.
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
              <p className={s.gLabel}>A photo from tonight</p>
              <div className={s.gPhotoPicked}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/photos/wed-dancing-1100.webp" alt="" width={1100} height={733} />
              </div>
              <div className={s.gName}>Mara</div>
              <div className={s.gStarters}>
                <span>The night we met&hellip;</span>
                <span>You two in&hellip;</span>
                <span>Every summer&hellip;</span>
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
        <div className={s.extrasGrid}>
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
