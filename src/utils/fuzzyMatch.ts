export function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q.length === 0) return { match: true, score: 0 };
  if (t.includes(q)) return { match: true, score: q.length / t.length };

  let qi = 0;
  let score = 0;
  let consecutive = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      consecutive++;
      score += consecutive;
    } else {
      consecutive = 0;
    }
  }

  return { match: qi === q.length, score: qi === q.length ? score / t.length : 0 };
}
