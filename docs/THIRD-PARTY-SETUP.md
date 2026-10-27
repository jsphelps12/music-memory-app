# Third-party setup (occasions, Phase 1)

The accounts and keys the last Phase 1 batch needs. Each is something only
Josh can do (identity, billing, DNS). **Never paste a key into a chat or a
commit**: set it where the table says, then say it's set. Test/sandbox keys
go on staging, live keys on production.

Where secrets go:

- **Supabase function secrets:** Dashboard → project → Edge Functions →
  Secrets. Staging is `bqyrpahvdukllasafdpv`, production is
  `izfhbtipzuvinyacttin`.
- **Vercel env:** Vercel → music-memory-app → Settings → Environment
  Variables. Production for soundtracks.app; Preview for staging builds.

## 1. Stripe (take the $79) — start first, verification takes days

1. Create the account at dashboard.stripe.com. A sole proprietorship is fine:
   no LLC needed. Use your SSN, or an EIN if you have one.
2. Business details:
   - Name **Soundtracks**, website `https://soundtracks.app`.
   - Description: "Digital wedding guest book and keepsake".
   - Statement descriptor `SOUNDTRACKS`.
3. Add the bank account for payouts.
4. Leave products and prices alone. They're created in code, so test and
   live match.
5. Turn on Stripe Tax only if you want sales tax collected. That's an
   accountant question. Leave it off for now.
6. Keys: Developers → API keys.
   - Test mode `sk_test_…` → staging function secret `STRIPE_SECRET_KEY`.
   - Live `sk_live_…` → production function secret `STRIPE_SECRET_KEY`.
     Only when we launch.
7. The webhook comes later. Once the function exists, I'll give you the URL
   to add under Developers → Webhooks. It produces `STRIPE_WEBHOOK_SECRET`,
   which goes to the same place as the key.

## 2. Resend (email from soundtracks.app)

Your DNS is on Cloudflare, and Cloudflare Email Routing receives your mail.
Resend's records go on a `send.` subdomain, so receiving is untouched.

1. Create the account at resend.com.
2. Domains → Add `soundtracks.app`. Resend will want its records on
   `send.soundtracks.app`.
3. In Cloudflare DNS, add exactly the records Resend shows: an MX and a TXT
   (SPF) on `send`, and a TXT (DKIM) on `resend._domainkey`.
   - Set **Proxy status: DNS only** (grey cloud).
   - Also add the recommended DMARC TXT on `_dmarc` if there isn't one.
4. Click Verify. It's usually minutes.
5. API Keys → create one with "Sending access", domain `soundtracks.app`.
   It goes to four places:
   - Vercel env `RESEND_API_KEY` (Production and Preview): the /weddings
     reservation alert.
   - Function secret `RESEND_API_KEY` on **both** projects: the reminder and
     reveal emails.
   - Vercel env `RESERVATION_NOTIFY_EMAIL`: where reservation alerts go
     (your email).
   - Vercel env `RESERVATION_FROM_EMAIL`: `Soundtracks <hello@soundtracks.app>`.
6. Sign-in emails: Supabase → each project → Authentication → Emails → SMTP
   Settings, enable custom SMTP:
   - host `smtp.resend.com`, port `465`, user `resend`;
   - password: the API key;
   - sender `hello@soundtracks.app`, name `Soundtracks`.

   This replaces Supabase's rate-limited default sender.

## 3. Cloudflare Turnstile (stop bots on the guest page)

1. Cloudflare dashboard → Turnstile → Add widget, named "Soundtracks guest
   book".
2. Hostnames:
   - `soundtracks.app` and `www.soundtracks.app`;
   - the Vercel preview domain you use for staging, if any;
   - `localhost`.
3. Widget mode: **Managed**. Pre-clearance: off.
4. The site key (public) goes to Vercel env `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   (Production and Preview).
5. The secret key goes to the function secret `TURNSTILE_SECRET_KEY` on
   production.
6. On staging, use Cloudflare's always-pass test keys so automated tests
   aren't blocked:
   - site `1x00000000000000000000AA`;
   - secret `1x0000000000000000000000000000000AA`.

## 4. Apple MusicKit (full songs and "Save to Apple Music" on the keepsake)

1. developer.apple.com → Certificates, IDs & Profiles → Keys. If a key
   already has **Media Services (MusicKit, ShazamKit, Apple Music Feed)**
   enabled, reuse it. Otherwise:
   1. Identifiers → + → **Media IDs** → register `media.app.soundtracks`
      with MusicKit enabled.
   2. Keys → + → name "Soundtracks MusicKit web" → enable Media Services →
      configure it with that Media ID → Continue → Register.
2. Download the `.p8` file. **It can only be downloaded once**, so keep it
   somewhere safe, such as your password manager.
3. Note the Key ID (on the key page) and your Team ID (top right of the
   developer site).
4. Function secrets on **both** projects:
   - `APPLE_MUSIC_TEAM_ID`;
   - `APPLE_MUSIC_KEY_ID`;
   - `APPLE_MUSIC_PRIVATE_KEY`: the whole `.p8` contents, including the
     BEGIN/END lines.

   A function uses them to mint short-lived developer tokens for MusicKit JS.
   The key itself never reaches a browser.

## When they're done

Tell Claude which ones are set. Each one unlocks its piece, in this order:
Stripe checkout, then Resend emails, then Turnstile, then MusicKit playback.
