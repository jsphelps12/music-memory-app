import Image from "next/image";

export default function Home() {
  return (
    <main>
      <style>{`
        :root {
          --cream: #FBF6F1;
          --charcoal: #1C1814;
          --orange: #E8825C;
          --purple: #6B5F8C;
          --divider: rgba(255,255,255,0.08);
        }

        * { box-sizing: border-box; }

        .display { font-family: 'Playfair Display', Georgia, serif; }
        .body-font { font-family: 'DM Sans', -apple-system, sans-serif; }

        /* Staggered entry */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fu  { animation: fadeUp 0.75s cubic-bezier(.22,1,.36,1) both; opacity: 0; }
        .d1  { animation-delay: 0.05s; }
        .d2  { animation-delay: 0.18s; }
        .d3  { animation-delay: 0.32s; }
        .d4  { animation-delay: 0.46s; }
        .d5  { animation-delay: 0.60s; }

        /* Vinyl record */
        @keyframes spin-slow {
          from { transform: translateY(-50%) rotate(0deg); }
          to   { transform: translateY(-50%) rotate(360deg); }
        }
        .vinyl-ring {
          position: absolute;
          right: -220px;
          top: 50%;
          width: 680px;
          height: 680px;
          border-radius: 50%;
          border: 1px solid rgba(251,246,241,0.06);
          box-shadow:
            inset 0 0 0 60px  rgba(255,255,255,0.015),
            inset 0 0 0 130px rgba(255,255,255,0.01),
            inset 0 0 0 200px rgba(255,255,255,0.015),
            inset 0 0 0 280px rgba(255,255,255,0.008),
            inset 0 0 0 310px rgba(28,24,20,0.8);
          animation: spin-slow 90s linear infinite;
          pointer-events: none;
        }
        .vinyl-ring::after {
          content: '';
          position: absolute;
          top: 50%; left: 50%;
          width: 20px; height: 20px;
          border-radius: 50%;
          background: rgba(251,246,241,0.12);
          transform: translate(-50%,-50%);
        }

        /* Waveform bars */
        @keyframes w1 { 0%,100%{height:10px} 50%{height:28px} }
        @keyframes w2 { 0%,100%{height:18px} 50%{height: 8px} }
        @keyframes w3 { 0%,100%{height: 6px} 50%{height:24px} }
        @keyframes w4 { 0%,100%{height:22px} 50%{height:12px} }
        @keyframes w5 { 0%,100%{height:14px} 50%{height:32px} }
        .wbar {
          display: inline-block;
          width: 3px;
          border-radius: 2px;
          background: var(--orange);
          opacity: 0.9;
        }
        .wbar:nth-child(1) { animation: w1 1.2s ease-in-out infinite; }
        .wbar:nth-child(2) { animation: w2 1.4s ease-in-out infinite; animation-delay:.1s; }
        .wbar:nth-child(3) { animation: w3 1.1s ease-in-out infinite; animation-delay:.2s; }
        .wbar:nth-child(4) { animation: w4 1.3s ease-in-out infinite; animation-delay:.15s; }
        .wbar:nth-child(5) { animation: w5 1.2s ease-in-out infinite; animation-delay:.05s; }
        .wbar:nth-child(6) { animation: w1 1.5s ease-in-out infinite; animation-delay:.25s; }
        .wbar:nth-child(7) { animation: w3 1.2s ease-in-out infinite; animation-delay:.30s; }
        .wbar:nth-child(8) { animation: w2 1.1s ease-in-out infinite; animation-delay:.10s; }
        .wbar:nth-child(9) { animation: w4 1.3s ease-in-out infinite; animation-delay:.35s; }

        /* Step number gradient text */
        .step-num {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 4.5rem;
          font-weight: 700;
          line-height: 1;
          background: linear-gradient(135deg, var(--orange) 0%, var(--purple) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* Feature rows */
        .feat-row {
          display: grid;
          grid-template-columns: 100px 1fr 2fr;
          gap: 24px;
          align-items: center;
          padding: 28px 48px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          transition: background 0.2s ease;
        }
        .feat-row:hover { background: #1A1612; }
        .feat-row:first-child { border-top: 1px solid rgba(255,255,255,0.08); }

        /* Scroll hint */
        @keyframes bounce {
          0%,100% { transform: translateX(-50%) translateY(0);   opacity:.35; }
          50%      { transform: translateX(-50%) translateY(8px); opacity:.85; }
        }
        .scroll-cue { animation: bounce 2s ease-in-out infinite; }

        /* App Store button glow on hover */
        .appstore-btn {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .appstore-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(232,130,92,0.35);
        }

        /* Hero phone mockup */
        .hero-phone {
          position: absolute;
          right: clamp(32px, 6vw, 80px);
          top: 50%;
          transform: translateY(-46%);
          width: clamp(200px, 22vw, 280px);
          border-radius: 36px;
          box-shadow: 0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06);
          z-index: 3;
          pointer-events: none;
          display: block;
        }
        @media (max-width: 900px) {
          .hero-phone { display: none; }
        }

        /* Step phone screenshots */
        .step-phone {
          width: 100%;
          max-width: 180px;
          margin: 28px auto 0;
          display: block;
          border-radius: 24px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
        }


        /* Product cards border grid */
        .product-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .product-card {
          padding: 40px 32px;
          border-right: 1px solid rgba(255,255,255,0.08);
        }
        .product-card:last-child { border-right: none; }

        @media (max-width: 768px) {
          .vinyl-ring { width: 340px; height: 340px; right: -140px; }
          .feat-row {
            grid-template-columns: 1fr;
            gap: 8px;
            padding: 24px clamp(24px,6vw,64px);
          }
          .feat-tag { display: none; }
          .product-grid { grid-template-columns: 1fr; }
          .product-card { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.08); }
          .product-card:last-child { border-bottom: none; }
          .footer-inner { flex-direction: column; align-items: flex-start; }
        }
      `}</style>

      {/* ─── Header ──────────────────────────────────────────── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        backgroundColor: 'rgba(15,13,11,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '14px clamp(16px,4vw,32px)',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Image src="/icon.png" alt="Soundtracks" width={28} height={28} style={{ borderRadius: 7 }} />
          <span className="display" style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FBF6F1', letterSpacing: '-0.01em' }}>
            Soundtracks
          </span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <a
            href="https://apps.apple.com/us/app/soundtracks/id6759203604"
            className="body-font appstore-btn"
            style={{
              fontSize: '0.875rem', fontWeight: 500,
              padding: '9px 20px', borderRadius: 999,
              color: '#fff', backgroundColor: '#E8825C',
              textDecoration: 'none', display: 'inline-block',
            }}
          >
            Download
          </a>
        </div>
      </header>

      {/* ─── Hero ────────────────────────────────────────────── */}
      <section
        className="hero-pad"
        style={{
          backgroundColor: '#1C1814',
          minHeight: '100vh',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: 'clamp(100px,14vw,120px) clamp(24px,6vw,64px) 80px',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div className="vinyl-ring" />

        <div style={{ maxWidth: 760, position: 'relative', zIndex: 2 }}>
          <div className="fu d1" style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 36, height: 36 }}>
            {[1,2,3,4,5,6,7,8,9].map(i => (
              <div key={i} className="wbar" style={{ height: [10,18,6,22,14,28,8,20,12][i-1] }} />
            ))}
          </div>

          <h1 className="display fu d2" style={{
            fontSize: 'clamp(3rem, 8.5vw, 6.5rem)',
            fontWeight: 700,
            lineHeight: 1.02,
            color: '#FBF6F1',
            letterSpacing: '-0.025em',
            marginBottom: 10,
          }}>
            Your life has<br />a soundtrack.
          </h1>

          <p className="display fu d3" style={{
            fontSize: 'clamp(1.8rem, 4.5vw, 3.2rem)',
            fontWeight: 600,
            fontStyle: 'italic',
            color: '#E8825C',
            lineHeight: 1.1,
            marginBottom: 28,
          }}>
            Now it has a home.
          </p>

          <p className="body-font fu d4" style={{
            fontSize: '1.05rem',
            lineHeight: 1.75,
            color: 'rgba(251,246,241,0.55)',
            maxWidth: 440,
            marginBottom: 44,
          }}>
            A journal for music memories — capture the song, the moment,
            and the feeling before it fades.
          </p>

          <div className="fu d5" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <a
              href="https://apps.apple.com/us/app/soundtracks/id6759203604"
              className="body-font appstore-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '14px 28px', borderRadius: 999,
                backgroundColor: '#E8825C', color: '#fff',
                fontWeight: 500, fontSize: '1rem',
                textDecoration: 'none', letterSpacing: '0.005em',
              }}
            >
              <AppleLogo />
              Download on the App Store
            </a>
            <span className="body-font" style={{ fontSize: '0.875rem', color: 'rgba(251,246,241,0.3)' }}>
              Free to download
            </span>
          </div>
        </div>

        <Image
          src="/screenshots/detail.png"
          alt="Soundtracks moment detail"
          width={280}
          height={610}
          className="hero-phone"
        />

        <div className="scroll-cue" style={{
          position: 'absolute', bottom: 32, left: '50%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        }}>
          <span className="body-font" style={{ fontSize: '0.65rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(251,246,241,0.28)' }}>scroll</span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: 'rgba(251,246,241,0.28)' }}>
            <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </section>

      {/* ─── Pull quote ──────────────────────────────────────── */}
      <section
        className="section-pad"
        style={{ backgroundColor: '#0F0D0B', padding: 'clamp(72px,10vw,100px) clamp(24px,6vw,64px)', textAlign: 'center' }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{
            width: 48, height: 2,
            background: 'linear-gradient(90deg, #E8825C, #6B5F8C)',
            margin: '0 auto 40px',
          }} />
          <p className="display" style={{
            fontSize: 'clamp(1.4rem, 3.5vw, 2.2rem)',
            fontWeight: 600, fontStyle: 'italic',
            lineHeight: 1.45, color: '#FBF6F1',
            marginBottom: 28,
          }}>
            &ldquo;Music is the most powerful memory trigger we have. A song can take you back to a specific moment, place, and feeling — instantly.&rdquo;
          </p>
          <p className="body-font" style={{ fontSize: '1rem', lineHeight: 1.7, color: 'rgba(255,255,255,0.45)' }}>
            Soundtracks is built around that truth — a personal timeline of your life, told through music.
          </p>
        </div>
      </section>

      {/* ─── How it works ────────────────────────────────────── */}
      <section
        className="section-pad"
        style={{ backgroundColor: '#111009', padding: 'clamp(72px,10vw,80px) clamp(24px,6vw,64px)' }}
      >
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <p className="body-font" style={{
            fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
            textAlign: 'center', marginBottom: 56,
          }}>
            How it works
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '48px 40px' }}>
            {[
              { num: '01', title: 'Hear a song', body: 'Search Apple Music or let the app detect what\'s playing. Attach any song to any moment in your life.', img: '/screenshots/capture.png', alt: 'Capture a Moment screen' },
              { num: '02', title: 'Capture the memory', body: 'Add a photo, write your reflection, tag the people and the place that made it matter.', img: '/screenshots/detail.png', alt: 'Moment detail screen' },
              { num: '03', title: 'Revisit forever', body: 'Your timeline grows into the soundtrack of your life — searchable, shareable, entirely yours.', img: '/screenshots/timeline.png', alt: 'Timeline screen' },
            ].map(({ num, title, body, img, alt }) => (
              <div key={num} style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="step-num" style={{ marginBottom: 16 }}>{num}</div>
                <h3 className="display" style={{
                  fontSize: '1.35rem', fontWeight: 700,
                  color: '#FBF6F1', marginBottom: 12, lineHeight: 1.2,
                }}>
                  {title}
                </h3>
                <p className="body-font" style={{ fontSize: '0.95rem', lineHeight: 1.75, color: 'rgba(255,255,255,0.5)' }}>
                  {body}
                </p>
                <Image src={img} alt={alt} width={180} height={392} className="step-phone" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features (editorial rows) ───────────────────────── */}
      <section style={{ backgroundColor: '#0F0D0B', paddingTop: 72, paddingBottom: 8 }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 clamp(24px,6vw,64px) 32px' }}>
          <p className="body-font" style={{
            fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
          }}>
            Everything inside
          </p>
        </div>
        {[
          { tag: 'Timeline',     title: 'Your whole life in one scroll.',        body: 'Every moment lives on a beautiful timeline, grouped by month. Scroll back through the years anytime you want.' },
          { tag: 'Sharing',      title: 'Share with people you love.',           body: 'Send a moment to a friend. Start a shared album with family. Your memories, together.' },
          { tag: 'Events',       title: 'Guest books for your biggest days.',    body: 'Weddings, reunions, road trips — invite anyone to add their song. No app required.' },
          { tag: 'Now Playing',  title: 'Capture what\'s already playing.',      body: 'Soundtracks detects what\'s playing in Apple Music and pre-fills the moment. Never lose a song again.' },
        ].map(({ tag, title, body }) => (
          <div key={tag} className="feat-row" style={{ maxWidth: '100%' }}>
            <span className="body-font feat-tag" style={{
              fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
              paddingLeft: 'clamp(24px,6vw,64px)',
            }}>{tag}</span>
            <h3 className="display" style={{
              fontSize: '1.25rem', fontWeight: 700,
              color: '#FBF6F1', lineHeight: 1.25,
            }}>{title}</h3>
            <p className="body-font" style={{
              fontSize: '0.95rem', lineHeight: 1.75, color: 'rgba(255,255,255,0.45)',
              paddingRight: 'clamp(0px,4vw,64px)',
            }}>{body}</p>
          </div>
        ))}
      </section>

      {/* ─── Physical products ───────────────────────────────── */}
      <section
        className="section-pad"
        style={{ backgroundColor: '#1C1814', padding: 'clamp(72px,10vw,100px) clamp(24px,6vw,64px)' }}
      >
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ marginBottom: 60 }}>
            <p className="body-font" style={{
              fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: '#E8825C', marginBottom: 20,
            }}>Coming soon</p>
            <h2 className="display" style={{
              fontSize: 'clamp(2rem, 5vw, 3.5rem)',
              fontWeight: 700, color: '#FBF6F1',
              lineHeight: 1.05, letterSpacing: '-0.025em',
            }}>
              Your memories,<br />printed.
            </h2>
          </div>
          <div className="product-grid">
            {[
              { icon: '📖', title: 'Annual Book',    body: 'Every year, your soundtrack becomes a beautiful softcover book. Order it, gift it, keep it forever.' },
              { icon: '✉️', title: 'Moment Cards',   body: 'Send a single memory as a printed card — a song, a photo, a note — mailed to someone you love.' },
              { icon: '🖼',  title: 'Wall Art',       body: 'Print any moment as a 12×12 canvas or fine art print. For your wall, your office, your home.' },
            ].map(({ icon, title, body }) => (
              <div key={title} className="product-card">
                <div style={{ fontSize: '2rem', marginBottom: 24 }}>{icon}</div>
                <h3 className="display" style={{
                  fontSize: '1.25rem', fontWeight: 700,
                  color: '#FBF6F1', marginBottom: 12,
                }}>{title}</h3>
                <p className="body-font" style={{
                  fontSize: '0.9rem', lineHeight: 1.75,
                  color: 'rgba(251,246,241,0.45)',
                }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ───────────────────────────────────────── */}
      <section
        className="section-pad"
        style={{ backgroundColor: '#0F0D0B', padding: 'clamp(80px,12vw,120px) clamp(24px,6vw,64px)', textAlign: 'center' }}
      >
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <h2 className="display" style={{
            fontSize: 'clamp(2.5rem, 6vw, 4.2rem)',
            fontWeight: 700, fontStyle: 'italic',
            color: '#FBF6F1', lineHeight: 1.05,
            letterSpacing: '-0.025em', marginBottom: 20,
          }}>
            Start capturing<br />today.
          </h2>
          <p className="body-font" style={{
            fontSize: '1rem', color: 'rgba(255,255,255,0.45)',
            lineHeight: 1.7, marginBottom: 44,
          }}>
            Free to download. Your memories are worth keeping.
          </p>
          <a
            href="https://apps.apple.com/us/app/soundtracks/id6759203604"
            className="body-font appstore-btn"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '16px 32px', borderRadius: 999,
              backgroundColor: '#E8825C', color: '#fff',
              fontWeight: 500, fontSize: '1rem',
              textDecoration: 'none', letterSpacing: '0.005em',
            }}
          >
            <AppleLogo />
            Download on the App Store
          </a>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────── */}
      <footer style={{ backgroundColor: '#0F0D0B', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '24px clamp(20px,5vw,48px)' }}>
        <div className="footer-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="body-font" style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)' }}>
            © {new Date().getFullYear()} Soundtracks
          </span>
          <div style={{ display: 'flex', gap: 28 }}>
            {[['Privacy', '/privacy'], ['Terms', '/terms']].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="body-font"
                style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}

function AppleLogo() {
  return (
    <svg width="15" height="18" viewBox="0 0 16 19" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M13.17 10.06c-.02-2 1.65-2.97 1.72-3.02-1.03-1.5-2.55-1.62-3.06-1.64-1.31-.13-2.56.77-3.22.77-.67 0-1.69-.76-2.78-.74-1.43.02-2.75.83-3.48 2.1-1.49 2.58-.38 6.4 1.06 8.5.71 1.02 1.55 2.17 2.65 2.13 1.07-.04 1.47-.69 2.76-.69 1.28 0 1.65.69 2.77.67 1.14-.02 1.87-1.04 2.57-2.07.81-1.18 1.14-2.33 1.16-2.39-.03-.01-2.15-.82-2.15-3.62zM10.9 3.44c.59-.71.99-1.7.88-2.69-.85.04-1.88.57-2.49 1.27-.55.63-1.03 1.64-.9 2.6.94.07 1.91-.48 2.51-1.18z" />
    </svg>
  );
}
