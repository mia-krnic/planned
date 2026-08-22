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

/**
 * The same twelve in Chinese, in the same order: nightLine draws one index and
 * reads it out of whichever array the language calls for, so the two lists have
 * to stay parallel — a line added to one wants its counterpart in the other.
 */
export const NIGHT_LINES_ZH: string[] = [
  '凌晨两点的图书馆开着门',
  '夜班：安静的时段，柔软的专注',
  '月亮陪你一起值班',
  '全世界都睡了，台灯还没有',
  '此刻一切都安静下来了，包括那些疑虑',
  '这个点没有人发邮件，这是一份礼物',
  '夜深了，就走小步',
  '城市把灯调暗，好让你想事情',
  '你和路灯，都还亮着',
  '常驻夜猫子',
  '这是没有什么会打断你的一小时',
  '温柔一点——早晨还是会来的',
]
