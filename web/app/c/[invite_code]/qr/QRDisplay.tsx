"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface Props {
  url: string;
  collectionName: string;
}

export default function QRDisplay({ url, collectionName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, url, {
      width: 320,
      margin: 2,
      color: {
        dark: "#2C2C3A",
        light: "#FBF6F1",
      },
    }).then(() => setReady(true));
  }, [url]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${collectionName.replace(/\s+/g, "-").toLowerCase()}-qr.png`;
    a.click();
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 gap-6"
      style={{ backgroundColor: "#FBF6F1" }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#E8825C" }}>
        Guest Contributions
      </p>
      <h1 className="text-2xl font-bold text-center" style={{ color: "#2C2C3A" }}>
        {collectionName}
      </h1>

      {/* QR Code */}
      <div
        className="rounded-3xl p-6 shadow-lg"
        style={{ backgroundColor: "#FBF6F1", border: "2px solid #E8D8CC" }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", opacity: ready ? 1 : 0, transition: "opacity 0.2s" }}
        />
      </div>

      <p className="text-sm text-center max-w-xs" style={{ color: "#999" }}>
        Guests scan this code to add their song memories — no app required.
      </p>

      <button
        onClick={handleDownload}
        disabled={!ready}
        className="px-8 py-3 rounded-full font-semibold text-base transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ backgroundColor: "#2C2C3A", color: "#fff" }}
      >
        Download QR Code
      </button>

      <p className="text-xs" style={{ color: "#bbb" }}>
        {url}
      </p>
    </div>
  );
}
