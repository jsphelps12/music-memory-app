"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";

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
    // Ink on paper in both themes: it gets printed and scanned, and dark-on-
    // light scans most reliably. Rendered at 2x so the download prints sharp.
    QRCode.toCanvas(canvas, url, {
      width: 640,
      margin: 2,
      color: { dark: "#23222B", light: "#FBF7F2" },
    }).then(() => setReady(true));
  }, [url]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${collectionName.replace(/\s+/g, "-").toLowerCase()}-qr.png`;
    a.click();
  }

  return (
    <main className={s.page}>
      <div className={`${s.column} ${s.narrow}`}>
        <div className={s.noPrint}>
          <TopBar />
        </div>

        <h1 className={s.headline}>{collectionName}</h1>
        <p className={`${s.body} ${s.lede}`}>
          Guests scan this to add a song and a few words. No app, no account.
        </p>

        <div className={s.qr}>
          <canvas ref={canvasRef} style={{ opacity: ready ? 1 : 0 }} />
        </div>

        <div className={s.noPrint}>
          <button type="button" onClick={handleDownload} disabled={!ready} className={s.button}>
            Download QR code
          </button>
          <p className={`${s.meta} ${s.url}`}>{url}</p>
        </div>
      </div>
    </main>
  );
}
