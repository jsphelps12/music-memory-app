export const pad = (n: number) => String(n).padStart(2, "0");

export function dateToStr(date: Date): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  return `${y}-${m}-${d}`;
}
