/**
 * The Home page's quote of the day.
 *
 * Each entry pairs a two-to-four-word mantra (the line under the clock) with a
 * longer quote (the line along the bottom). Everything here is a real, sourced
 * quotation; `author` is left out only when a line genuinely has no known one.
 *
 * The list is append-only by design: `quotePairForDate` indexes it modulo its
 * own length, so dropping hundreds more entries at the end needs no other
 * change. It does mean the pair a given date lands on shifts when the length
 * changes — the promise is "one pair a day, the same for everyone", not "this
 * date always gets this pair".
 */

export interface QuotePair {
  /** Two to four words. Shown large, under the clock. */
  short: string
  /** The full quotation. Shown quietly along the bottom of the page. */
  long: string
  author?: string
}

export const QUOTE_PAIRS: QuotePair[] = [
  {
    short: 'Live freely.',
    long: 'Rather than love, than money, than fame, give me truth.',
    author: 'Henry David Thoreau, Walden',
  },
  {
    short: 'Begin again.',
    long: 'Finish each day and be done with it. You have done what you could.',
    author: 'Ralph Waldo Emerson',
  },
  {
    short: 'Be here now.',
    long: 'Confine yourself to the present.',
    author: 'Marcus Aurelius, Meditations',
  },
  {
    short: 'Mind over noise.',
    long: 'You have power over your mind — not outside events. Realise this, and you will find strength.',
    author: 'Marcus Aurelius, Meditations',
  },
  {
    short: 'Look for helpers.',
    long: 'Look for the helpers. You will always find people who are helping.',
    author: 'Fred Rogers',
  },
  {
    short: 'Take your time.',
    long: 'Time is too slow for those who wait, too swift for those who fear, too long for those who grieve, too short for those who rejoice, but for those who love, time is eternity.',
    author: 'Henry van Dyke',
  },
  {
    short: 'See with heart.',
    long: 'It is only with the heart that one can see rightly; what is essential is invisible to the eye.',
    author: 'Antoine de Saint-Exupéry, The Little Prince',
  },
  {
    short: "Tend what's yours.",
    long: 'You become responsible, forever, for what you have tamed.',
    author: 'Antoine de Saint-Exupéry, The Little Prince',
  },
  {
    short: 'Face the sun.',
    long: 'Keep your face to the sunshine and you cannot see a shadow.',
    author: 'Helen Keller',
  },
  {
    short: 'Dare greatly.',
    long: 'Life is either a daring adventure or nothing at all.',
    author: 'Helen Keller',
  },
  {
    short: 'Small steps count.',
    long: 'A journey of a thousand miles begins with a single step.',
    author: 'Lao Tzu, Tao Te Ching',
  },
  {
    short: 'Do less, better.',
    long: 'It is not that we have a short time to live, but that we waste a lot of it.',
    author: 'Seneca, On the Shortness of Life',
  },
  {
    short: 'Hold it lightly.',
    long: 'Men are disturbed not by things, but by the views which they take of things.',
    author: 'Epictetus, Enchiridion',
  },
  {
    short: 'Want what you have.',
    long: 'He is a wise man who does not grieve for the things which he has not, but rejoices for those which he has.',
    author: 'Epictetus',
  },
  {
    short: 'Simplify, simplify.',
    long: 'Our life is frittered away by detail. Simplify, simplify.',
    author: 'Henry David Thoreau, Walden',
  },
  {
    short: 'Grow slowly.',
    long: "Adopt the pace of nature: her secret is patience.",
    author: 'Ralph Waldo Emerson',
  },
  {
    short: 'Rest is work.',
    long: 'Sometimes the most important thing in a whole day is the rest we take between two deep breaths.',
    author: 'Etty Hillesum',
  },
  {
    short: 'Kindness first.',
    long: 'Be kind, for everyone you meet is fighting a hard battle.',
    author: 'Ian Maclaren',
  },
  {
    short: 'Notice the light.',
    long: 'In the depth of winter, I finally learned that within me there lay an invincible summer.',
    author: 'Albert Camus',
  },
  {
    short: 'Tend your garden.',
    long: 'We must cultivate our own garden.',
    author: 'Voltaire, Candide',
  },
]

/**
 * Whole days since the epoch for an ISO date. Built from the date's own parts
 * in UTC so the index is a property of the calendar day itself — no timezone,
 * no daylight saving, and the same answer on every machine.
 */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000)
}

/** The day's pair. Deterministic from the date, so it turns over at midnight. */
export function quotePairForDate(iso: string): QuotePair {
  const n = dayNumber(iso)
  const i = ((n % QUOTE_PAIRS.length) + QUOTE_PAIRS.length) % QUOTE_PAIRS.length
  return QUOTE_PAIRS[i]
}
