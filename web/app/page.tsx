export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6" style={{ backgroundColor: "#FBF6F1" }}>
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight" style={{ color: "#2C2C3A" }}>
          Tracks
        </h1>
        <p className="text-xl" style={{ color: "#666" }}>
          Capture moments. Remember everything.
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "#999" }}>
          Every song holds a memory. Tracks helps you capture it before it fades —
          the moment, the place, the feeling.
        </p>
        <div className="pt-4">
          <a
            href="#"
            className="inline-block px-8 py-3 rounded-full text-white font-semibold text-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#E8825C" }}
          >
            Download on the App Store
          </a>
        </div>
      </div>
      <footer className="absolute bottom-8 text-sm" style={{ color: "#999" }}>
        © {new Date().getFullYear()} Tracks
      </footer>
    </main>
  );
}
