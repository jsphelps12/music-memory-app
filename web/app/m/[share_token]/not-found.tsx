import Link from "next/link";
import { TopBar } from "@/components/Share";
import m from "./moment.module.css";

/**
 * Every refusal lands here the same way (a mistyped token, one that never
 * existed, a moment that was deleted or unshared), with the same words and a
 * 404, so the page never tells anyone whether a link was ever real.
 */
export default function SharedMomentNotFound() {
  return (
    <main className={m.page}>
      <div className={`${m.frame} ${m.frameNarrow}`}>
        <TopBar />
        <h1 className={m.calmTitle}>This link doesn&rsquo;t work anymore</h1>
        <p className={m.calmBody}>
          The song may have been unshared, or the link was copied only in part. Whoever sent it can share it again.
        </p>
        <p className={m.calmBody}>
          <Link href="/" prefetch={false} className={m.textLink}>
            What&rsquo;s Soundtracks?
          </Link>
        </p>
      </div>
    </main>
  );
}
