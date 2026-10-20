import { AppStoreBadge, TopBar } from "@/components/Share";
import s from "@/components/share.module.css";

export default function ConfirmPage() {
  return (
    <main className={s.page}>
      <div className={`${s.column} ${s.narrow}`}>
        <TopBar />
        <h1 className={s.headline}>Email confirmed.</h1>
        <p className={`${s.body} ${s.lede}`}>Open Soundtracks on your iPhone and sign in.</p>
        <section className={s.ask}>
          <AppStoreBadge />
        </section>
      </div>
    </main>
  );
}
