// The poster's credits line: "With Northwind Pictures · The Weekly Ledger · +3 more".
// Satori can't measure text for us, so the line is fitted by characters (the poster uses a
// monospace font) and never wraps or gets clipped mid-name.

const SEP = ' · ';
const more = (n: number) => (n > 0 ? `${SEP}+${n} more` : '');

/** Up to `max` names that fit in `budget` characters, whole; the rest is counted, not cut. */
export function credits(names: string[], budget: number, max = 3): string {
  const all = [...new Set(names.map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean))];
  if (!all.length || budget < 4) return '';
  const shown: string[] = [];
  for (const name of all.slice(0, max)) {
    const next = [...shown, name].join(SEP) + more(all.length - shown.length - 1);
    if (next.length > budget) break;
    shown.push(name);
  }
  if (shown.length) return shown.join(SEP) + more(all.length - shown.length);
  // not even the first name fits whole: shorten it, and say there are more if room allows
  const tail = more(all.length - 1);
  const room = tail.length + 6 <= budget ? budget - tail.length : budget;
  return `${all[0].slice(0, room - 1).trimEnd()}…${room === budget ? '' : tail}`;
}
