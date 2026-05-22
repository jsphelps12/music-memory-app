export default function ConfirmPage() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: "var(--bg)" }}
    >
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-5xl">✉️</div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Email confirmed
        </h1>
        <p className="text-base leading-relaxed" style={{ color: "var(--text-body)" }}>
          Open the Soundtracks app on your iPhone to sign in.
        </p>
        <div className="pt-4">
          <a
            href="https://apps.apple.com/us/app/soundtracks/id6759203604"
            className="inline-block px-8 py-3 rounded-full text-white font-semibold text-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Download on the App Store
          </a>
        </div>
      </div>
    </main>
  );
}
