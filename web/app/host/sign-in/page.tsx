import type { Metadata } from "next";
import { TopBar } from "@/components/Share";
import s from "@/components/share.module.css";
import { safeNext } from "@/lib/occasionHost";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className={s.page}>
      <div className={`${s.column} ${s.narrow}`}>
        <TopBar />
        <h1 className={s.headline}>Your wedding</h1>
        <p className={`${s.body} ${s.lede}`}>
          Sign in to set up your guest book, or to see the songs coming in. If you have the Soundtracks app, use the
          same email.
        </p>
        <SignInForm next={safeNext(next)} linkFailed={error === "link"} />
      </div>
    </main>
  );
}
