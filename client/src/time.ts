// All rule times are Asia/Bangkok (NFR-05). The UI shows them in that zone whatever the
// browser's own zone is, and sends instants as UTC ISO strings (F-04 section 2, step 2).

const ZONE = "Asia/Bangkok";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: false });

/** "Tue 10 Nov 2026" */
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso)).replace(",", "");
}

/** "09:00" */
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** A date input value ("2026-11-10") and a time ("09:00") in Bangkok, as a UTC ISO string. */
export function bangkokToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+07:00`).toISOString();
}

/** True if a date input value ("2026-11-14") is a Saturday or Sunday. */
export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** 08:00 to 17:30 in 30-minute steps (BR-02). */
export const START_TIMES: string[] = Array.from({ length: 20 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 === 0 ? "00" : "30"}`;
});
