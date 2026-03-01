import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Tracks",
};

export default function PrivacyPolicy() {
  return (
    <main style={{ backgroundColor: "#FBF6F1", minHeight: "100vh" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "64px 24px 96px" }}>
        <a
          href="/"
          style={{ fontSize: 14, color: "#E8825C", textDecoration: "none", display: "inline-block", marginBottom: 40 }}
        >
          ← Tracks
        </a>

        <h1 style={{ fontSize: 36, fontWeight: 700, color: "#2C2C3A", marginBottom: 8 }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: 14, color: "#999", marginBottom: 48 }}>Last updated: March 2026</p>

        <Section>
          <p>
            Tracks is a personal music memory journal. You write down what songs mean to you —
            moments, places, feelings. That&apos;s intimate data. We take that seriously, and we want
            to be straightforward about what we collect, why, and how it&apos;s handled.
          </p>
          <p>
            Tracks is operated by <strong>[Your Name]</strong>. If you have any questions, email us
            at <a href="mailto:hello@tracks.app" style={{ color: "#E8825C" }}>hello@tracks.app</a>.
          </p>
        </Section>

        <H2>What we collect</H2>

        <H3>Account information</H3>
        <Section>
          <ul>
            <li><strong>Email address</strong> — used to log you in and contact you about your account.</li>
            <li><strong>Apple ID</strong> — if you sign in with Apple, we receive a unique identifier and, on first sign-in, your name and email address if you choose to share them.</li>
            <li><strong>Display name and profile photo</strong> — set by you, visible to members of shared collections you create or join.</li>
          </ul>
        </Section>

        <H3>Your moments</H3>
        <Section>
          <p>
            Everything you log in Tracks is yours. We store it so you can access it across devices
            and revisit it over time.
          </p>
          <ul>
            <li><strong>Reflection text</strong> — the free-form writing you attach to a moment. This is the most personal data in Tracks. It is never read by us, never used for advertising, and never sold.</li>
            <li><strong>Song metadata</strong> — title, artist, album, and Apple Music ID for songs you attach to moments. Sourced from Apple&apos;s catalog.</li>
            <li><strong>Photos</strong> — photos you choose to attach to moments, stored securely.</li>
            <li><strong>Mood tags, people tags, location, and date</strong> — optional fields you fill in to give your moments more context.</li>
            <li><strong>Voice notes</strong> — if you record a voice note with a moment, it is stored securely and only accessible to you.</li>
          </ul>
        </Section>

        <H3>Music preferences (optional, collected at signup)</H3>
        <Section>
          <p>
            To help surface songs that are likely to hold personal meaning for you, we may ask for:
          </p>
          <ul>
            <li><strong>Birth year</strong> — used to calculate the era when music tends to form the strongest memories (roughly ages 13–25).</li>
            <li><strong>Country</strong> — used to match regional chart data so suggestions are culturally relevant.</li>
            <li><strong>Favorite artists and songs</strong> — used to find songs you&apos;re likely to have emotional connections to.</li>
            <li><strong>Genre preferences</strong> — used to weight suggestions toward music you actually listen to.</li>
          </ul>
          <p>
            This information is optional (except birth year and country, which improve suggestions significantly).
            It is never shared with third parties and is only used to personalize your experience inside Tracks.
          </p>
        </Section>

        <H3>Collections</H3>
        <Section>
          <ul>
            <li><strong>Collection names and invite codes</strong> — stored to enable shared collections between users.</li>
            <li><strong>Membership</strong> — we track which users have joined which shared collections.</li>
            <li><strong>Contributor attribution</strong> — in shared collections, your display name is shown alongside moments you contribute.</li>
          </ul>
        </Section>

        <H3>Technical data</H3>
        <Section>
          <ul>
            <li><strong>Push notification token</strong> — if you enable notifications, we store a token to send them to your device. No notification content is stored on our servers after delivery.</li>
            <li><strong>Notification preferences</strong> — which notification types you&apos;ve enabled or disabled.</li>
            <li><strong>App usage data</strong> — anonymous events like &quot;moment created&quot; or &quot;notification opened&quot; to help us understand how the app is used. Collected via PostHog. No personally identifiable information is attached.</li>
            <li><strong>Crash reports</strong> — anonymized technical data when the app crashes, collected via Sentry. Helps us fix bugs.</li>
            <li><strong>Deep link data</strong> — if you arrive at Tracks via an invite link, Branch.io temporarily holds the invite code so it can be retrieved after app install. See Branch&apos;s privacy policy for their data handling.</li>
          </ul>
        </Section>

        <H2>How we use your data</H2>
        <Section>
          <ul>
            <li>To store and sync your moments across your devices.</li>
            <li>To surface relevant resurfacing features — On This Day, A Month Ago, and song-prompted notifications.</li>
            <li>To enable shared collections and contributor attribution.</li>
            <li>To send push notifications you&apos;ve opted into.</li>
            <li>To improve the app using anonymous usage analytics and crash reports.</li>
          </ul>
          <p>
            We do not use your reflection text, mood data, or personal memories for advertising.
            We do not sell your data. We do not share your personal data with third parties except
            the infrastructure providers listed below, who process it on our behalf.
          </p>
        </Section>

        <H2>Third-party services</H2>
        <Section>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <th style={{ textAlign: "left", padding: "8px 12px 8px 0", color: "#2C2C3A" }}>Service</th>
                <th style={{ textAlign: "left", padding: "8px 12px 8px 0", color: "#2C2C3A" }}>Purpose</th>
              </tr>
            </thead>
            <tbody style={{ color: "#555" }}>
              {[
                ["Supabase", "Database, authentication, and photo storage"],
                ["Apple (Sign In with Apple, MusicKit, APNs)", "Authentication, song catalog, push notification delivery"],
                ["Expo / Expo Push Notifications", "Push notification infrastructure"],
                ["Branch.io", "Deferred deep links for invite codes"],
                ["PostHog", "Anonymous usage analytics"],
                ["Sentry", "Crash reporting"],
                ["Vercel", "Web app hosting"],
                ["iTunes Search API", "Song metadata lookup"],
              ].map(([service, purpose]) => (
                <tr key={service} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "10px 12px 10px 0", fontWeight: 500, whiteSpace: "nowrap" }}>{service}</td>
                  <td style={{ padding: "10px 0" }}>{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <H2>Data storage and security</H2>
        <Section>
          <p>
            Your data is stored on Supabase, which runs on AWS infrastructure. Photos are stored in
            Supabase Storage with a public CDN for delivery. All database access is protected by
            row-level security — only you can read your moments.
          </p>
          <p>
            We use HTTPS for all data in transit. We do not have access to your Apple ID credentials.
          </p>
        </Section>

        <H2>Your rights</H2>
        <Section>
          <ul>
            <li><strong>Access</strong> — you can view all your data inside the app at any time.</li>
            <li><strong>Correction</strong> — you can edit or update any moment, your display name, and your profile photo.</li>
            <li><strong>Deletion</strong> — you can delete your account from the Profile screen. This permanently removes your account, all moments, all photos, and all associated data from our systems. This cannot be undone.</li>
            <li><strong>Data portability</strong> — we plan to add an export feature. In the meantime, email us at <a href="mailto:hello@tracks.app" style={{ color: "#E8825C" }}>hello@tracks.app</a> and we can provide a data export.</li>
          </ul>
        </Section>

        <H2>Children</H2>
        <Section>
          <p>
            Tracks is not intended for children under 13. We do not knowingly collect personal
            information from anyone under 13. If you believe we have inadvertently collected data
            from a child, please contact us and we will delete it.
          </p>
        </Section>

        <H2>Changes to this policy</H2>
        <Section>
          <p>
            We will update this policy as Tracks grows — new features may involve collecting
            additional data. When we make material changes, we will notify you in the app and
            update the &quot;Last updated&quot; date above. Continued use of Tracks after a change constitutes
            acceptance of the updated policy.
          </p>
        </Section>

        <H2>Contact</H2>
        <Section>
          <p>
            Questions, concerns, or requests:{" "}
            <a href="mailto:hello@tracks.app" style={{ color: "#E8825C" }}>hello@tracks.app</a>
          </p>
        </Section>

        <footer style={{ marginTop: 64, paddingTop: 24, borderTop: "1px solid #e5e0d8", fontSize: 13, color: "#aaa", display: "flex", justifyContent: "space-between" }}>
          <span>© {new Date().getFullYear()} Tracks</span>
          <a href="/terms" style={{ color: "#aaa" }}>Terms of Use</a>
        </footer>
      </div>
    </main>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 22, fontWeight: 700, color: "#2C2C3A", marginTop: 48, marginBottom: 16 }}>
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: 16, fontWeight: 600, color: "#2C2C3A", marginTop: 28, marginBottom: 10 }}>
      {children}
    </h3>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 15, lineHeight: 1.75, color: "#444" }}>
      {children}
    </div>
  );
}
