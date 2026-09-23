// Pure helper functions shared by the API routes. No I/O here.

export const TTL_SECONDS = 60 * 60 * 6; // sessions auto-expire after 6 hours

export function genCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

// Pairs up player ids randomly. An odd one out gets { bye: true } and
// plays a single round against a simple computer opponent.
export function makePairs(ids) {
  const shuffled = shuffle(ids);
  const pairs = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    pairs.push({ a: shuffled[i], b: shuffled[i + 1] });
  }
  if (shuffled.length % 2 === 1) {
    pairs.push({ a: shuffled[shuffled.length - 1], bye: true });
  }
  return pairs;
}

// Classic Axelrod payoff labels:
// R = reward (mutual cooperation), P = punishment (mutual defection),
// T = temptation (defect while the other cooperates),
// S = sucker's payoff (cooperate while the other defects).
export function payoffFor(mine, theirs, pay) {
  if (mine === "C" && theirs === "C") return pay.R;
  if (mine === "D" && theirs === "D") return pay.P;
  if (mine === "D" && theirs === "C") return pay.T;
  return pay.S;
}
