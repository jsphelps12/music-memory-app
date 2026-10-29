import Link from "next/link";
import { PrintButton } from "../HostActions";
import p from "./print.module.css";

/** The bar above every proof: back, what it is, and print (or save as PDF). */
export function ProofBar({ id, children, note }: { id: string; children: React.ReactNode; note?: string | null }) {
  return (
    <div className={p.bar}>
      <div className={p.barRow}>
        <Link href={`/host/${id}/print`}>All proofs</Link>
        <PrintButton />
      </div>
      <p className={p.barText}>{children}</p>
      {note ? <p className={p.barNote}>{note}</p> : null}
    </div>
  );
}
