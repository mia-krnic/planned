/**
 * What Home says to someone still up after 23:00.
 *
 * One is drawn per date, the same way the mantra and the quote are (see
 * homePicks): a pure function of the day, so the line does not shuffle itself
 * every time the minute ticks over — and someone else awake on the same night
 * is reading the same sentence.
 *
 * The register is a friend leaving the lamp on, never a health app: no advice,
 * no hours-of-sleep arithmetic, nothing that reads as a telling-off.
 */
export const NIGHT_LINES: string[] = [
  'the library of 2am is open',
  'night shift: quiet hours, soft focus',
  'the moon’s on duty with you',
  'the world’s asleep — the desk lamp isn’t',
  'everything is quieter now, including the doubts',
  'nobody is emailing at this hour, and that is a gift',
  'small hours, small steps',
  'the city dimmed itself so you could think',
  'you and the streetlights, still on',
  'night owl in residence',
  'this is the hour nothing interrupts',
  'keep it gentle — morning is still coming',
]
