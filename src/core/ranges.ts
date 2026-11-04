/** Parse a memory list like "10-20, 25, 30–32" into sorted unique numbers within 1..max. */
export function parseMemoryList(text: string, max = 99): { numbers: number[]; error?: string } {
  const out = new Set<number>();
  for (const part of text.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:[-–](\d+))?$/);
    if (!m) return { numbers: [], error: `"${part}" isn't a memory number or range like 10-20` };
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    if (lo < 1 || hi > max) return { numbers: [], error: `Memories go from 1 to ${max}` };
    for (let n = lo; n <= hi; n++) out.add(n);
  }
  return { numbers: [...out].sort((x, y) => x - y) };
}

/** Compact form of a list of numbers: [1,2,3,7] → "1–3, 7". */
export function formatMemoryList(numbers: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    let j = i;
    while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j++;
    parts.push(j > i ? `${numbers[i]}–${numbers[j]}` : `${numbers[i]}`);
    i = j;
  }
  return parts.join(", ");
}
