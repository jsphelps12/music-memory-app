import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Phone, Screen } from "../_landing/Phone";
import { Lockup, RecordMark } from "../_landing/RecordMark";
import landing from "../_landing/landing.module.css";
import { KeepsakeLoop } from "./KeepsakeLoop";
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

const KEEPSAKE = [
  {
    title: "The guest book that plays",
    body: "Every guest’s song with their words and photo, in the order the night went. Open it and it plays them back, one after another: full songs if you have Apple Music, 30-second previews if you don’t. Send it to everyone who was there, or keep it just for the two of you.",
  },
  {
    title: "The playlist",
    body: "Every song in one playlist, saved to Apple Music in a tap.",
  },
  {
    title: "Your photographer’s photos, too",
    body: "Guests who only picked a song still get a photo. Add your photographer’s gallery and each one gets the picture taken closest to when they chose it. You approve every match.",
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
    q: "What if a guest doesn’t add a photo?",
    a: "Their song and words still get a page. And once your photographer’s gallery comes in, you can add it: each song-only moment gets the photo taken closest to when that guest picked their song, and you approve each one.",
  },
  {
    q: "Can we both manage it?",
    a: "Yes. Whoever sets it up can invite their partner with a link, and you both see everything, share it and reveal it together.",
  },
  {
    q: "Can a guest take back what they added?",
    a: "Yes, any time, from the phone they used. You can also hide anything yourself.",
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

          <div className={s.heroPhone}>
            <Phone>
              <KeepsakeLoop />
            </Phone>
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
            <Screen src="/weddings/guest.webp" alt="The guest page: a song picked, a photo from the night, a name and a few words" />
          </Phone>
        </div>
      </section>

      <section className={`${s.guests} ${s.couple}`} aria-labelledby="couple-title">
        <div className={s.guestsPhone}>
          <Phone>
            <Screen src="/weddings/dashboard.webp" alt="The couple's page: every moment as it arrives, with a photo, song, words and name" />
          </Phone>
        </div>
        <div className={s.guestsCopy}>
          <h2 id="couple-title" className={s.sectionTitle}>
            Yours to run.
          </h2>
          <p className={s.body}>
            Set it up in a few minutes: your names, the date, a handful of songs to suggest. You get the link, a QR code,
            table cards to print and a message ready for the group chat.
          </p>
          <p className={s.body}>
            Moments arrive as the night goes. Hide anything you&rsquo;d rather not keep, invite your partner to run it
            with you, and when it closes two weeks after the wedding, play it through and send it to everyone.
          </p>
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
