import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — Tracks",
};

export default function TermsOfUse() {
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
          Terms of Use
        </h1>
        <p style={{ fontSize: 14, color: "#999", marginBottom: 48 }}>Last updated: March 2026</p>

        <Section>
          <p>
            These Terms of Use govern your use of the Tracks app and website (collectively, the
            &quot;Service&quot;), operated by <strong>[Your Name]</strong> (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
            By using Tracks, you agree to these terms. If you don&apos;t agree, please don&apos;t use the Service.
          </p>
        </Section>

        <H2>Your content</H2>
        <Section>
          <p>
            <strong>You own your content.</strong> The reflections, photos, and memories you create
            in Tracks belong to you. We do not claim ownership over anything you write or upload.
          </p>
          <p>
            By using Tracks, you grant us a limited, non-exclusive, royalty-free license to store,
            display, and transmit your content solely for the purpose of providing the Service to you.
            We do not use your content for advertising, sell it, or share it with third parties except
            as described in our Privacy Policy.
          </p>
          <p>
            You are responsible for the content you create. You agree not to use Tracks to store or
            share content that is illegal, harmful, or violates the rights of others.
          </p>
        </Section>

        <H2>Your account</H2>
        <Section>
          <ul>
            <li>You must be at least 13 years old to use Tracks.</li>
            <li>You are responsible for keeping your account credentials secure.</li>
            <li>You may not share your account with others or create accounts on behalf of others without their consent.</li>
            <li>You can delete your account at any time from the Profile screen. Deletion is permanent and removes all your data from our systems.</li>
          </ul>
        </Section>

        <H2>Shared collections</H2>
        <Section>
          <p>
            Tracks allows you to create and join shared collections with other users. By contributing
            a moment to a shared collection:
          </p>
          <ul>
            <li>Your display name will be shown alongside your contribution.</li>
            <li>The collection owner and other members can view your contributed moment.</li>
            <li>The collection owner may export or share collection content (e.g. a playlist or physical book).</li>
          </ul>
          <p>
            You can remove yourself from a shared collection at any time. Contributed moments will
            remain in the collection unless you delete them from your personal timeline.
          </p>
        </Section>

        <H2>Gifted moments</H2>
        <Section>
          <p>
            You may generate a private link to share a single moment with someone. Anyone with the
            link can view that moment on the web. You can revoke a gifted link at any time by
            deleting the moment or contacting us.
          </p>
        </Section>

        <H2>Subscriptions and payments</H2>
        <Section>
          <p>
            Some features of Tracks require a paid subscription (&quot;Tracks Plus&quot;). Subscriptions are
            managed through Apple&apos;s in-app purchase system and are subject to Apple&apos;s terms and
            conditions. We do not process payment information directly.
          </p>
          <ul>
            <li>Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period.</li>
            <li>Cancellation takes effect at the end of the current billing period — you retain access until then.</li>
            <li>Refunds are handled by Apple. Contact Apple Support for refund requests.</li>
          </ul>
        </Section>

        <H2>Acceptable use</H2>
        <Section>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose.</li>
            <li>Attempt to access, tamper with, or disrupt the Service&apos;s infrastructure.</li>
            <li>Reverse engineer, decompile, or otherwise attempt to extract the source code of Tracks.</li>
            <li>Use automated scripts to access the Service.</li>
            <li>Impersonate another person or create a false identity.</li>
          </ul>
        </Section>

        <H2>Intellectual property</H2>
        <Section>
          <p>
            The Tracks name, logo, app design, and non-user-generated content are owned by us and
            protected by applicable intellectual property laws. You may not use them without our
            prior written permission.
          </p>
          <p>
            Song titles, artist names, album artwork, and audio previews are the property of their
            respective rights holders. Tracks displays this content under its agreements with Apple
            MusicKit. We do not claim any rights to music content.
          </p>
        </Section>

        <H2>Disclaimer of warranties</H2>
        <Section>
          <p>
            Tracks is provided &quot;as is&quot; without warranties of any kind, express or implied. We do
            not warrant that the Service will be uninterrupted, error-free, or free of data loss.
            Personal memory data is precious — we strongly encourage you to not rely solely on
            Tracks as a backup of irreplaceable content.
          </p>
        </Section>

        <H2>Limitation of liability</H2>
        <Section>
          <p>
            To the maximum extent permitted by law, we are not liable for any indirect, incidental,
            special, or consequential damages arising from your use of Tracks, including loss of data.
            Our total liability to you for any claim arising from these terms or the Service shall
            not exceed the amount you paid us in the 12 months preceding the claim.
          </p>
        </Section>

        <H2>Changes to these terms</H2>
        <Section>
          <p>
            We may update these terms as the Service evolves. When we make material changes, we will
            notify you in the app and update the &quot;Last updated&quot; date above. Continued use of Tracks
            after a change constitutes acceptance of the updated terms.
          </p>
        </Section>

        <H2>Governing law</H2>
        <Section>
          <p>
            These terms are governed by the laws of the State of [Your State], United States, without
            regard to conflict of law principles.
          </p>
        </Section>

        <H2>Contact</H2>
        <Section>
          <p>
            Questions about these terms:{" "}
            <a href="mailto:hello@tracks.app" style={{ color: "#E8825C" }}>hello@tracks.app</a>
          </p>
        </Section>

        <footer style={{ marginTop: 64, paddingTop: 24, borderTop: "1px solid #e5e0d8", fontSize: 13, color: "#aaa", display: "flex", justifyContent: "space-between" }}>
          <span>© {new Date().getFullYear()} Tracks</span>
          <a href="/privacy" style={{ color: "#aaa" }}>Privacy Policy</a>
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

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 15, lineHeight: 1.75, color: "#444" }}>
      {children}
    </div>
  );
}
