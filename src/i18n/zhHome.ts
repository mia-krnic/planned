/**
 * Chinese strings for the Home page's living surface — kept apart from the
 * main UI dictionary (zh.ts) so the two can grow independently. Same rule:
 * keys are the exact English strings.
 *
 * Only the FIXED strings live here. The Home page's sentences that interpolate
 * a title, a time or a count are written out per language where they are built
 * (see utils/homeLife.ts), because Chinese reorders those pieces rather than
 * substituting them. The day's mantra and quote are not translations at all —
 * Chinese draws from its own pools (see data/quotesZh.ts).
 */
export const ZH_HOME: Record<string, string> = {
  // ---- The centre stack ----
  'Time': '时间',
  'What is your main goal for today?': '今天最重要的一件事是什么？',
  "Edit today's goal": '修改今天的目标',
  'How was today?': '今天过得怎么样？',
  'day off — nothing urgent today': '休息日——今天没有急事',

  // ---- The whispers homeLife writes with no blanks to fill ----
  'exam day — you’ve done the work, breathe': '考试日——该做的都做了，深呼吸',
  'heavy day — one thing at a time': '今天有点满——一次做一件',
  'you’ve done plenty — it’s fine to stop': '今天做得够多了——可以停下来了',

  // ---- Focus ring & weather ----
  'Focused today': '今日专注',
  // The two InfoIcon texts are written as concatenations in HomePage.tsx, so
  // their keys are too — a computed key keeps the halves identical to the
  // source rather than re-joined by hand into one long line that could drift.
  ['Focused minutes are wall time minus breaks, across every session logged today — '
    + 'a running session counts up to right now. Set a daily goal in the Timer page to fill the ring.']:
    '专注时长是今天每一节学习的实际用时减去休息，正在进行的一节计到此刻为止。'
    + '在计时页设一个每日目标，圆环就会填起来。',
  'Set a location ⚙': '设置地点 ⚙',
  ['Type where you are into the ⚙ view-settings menu in the top bar and today\'s weather shows up here — '
    + 'and the daily log fills its weather in for you.']:
    '在顶栏的 ⚙ 视图设置里填上你所在的城市，今天的天气就会出现在这里——每日记录里的天气也会替你填好。',

  // ---- The bottom rail ----
  'Today in the journal': '在日记里看今天',
  'Library': '收藏库',
  '· timer': '· 计时',
  '· journal': '· 日记',
  'next wallpaper': '换一张',
  'Show a different photo today': '今天换一张照片',
  'Keyboard shortcuts': '键盘快捷键',

  // ---- The library panel ----
  'Home library': '首页收藏库',
  'Wallpapers': '壁纸',
  'Quotes': '引言',
  'Mantras': '箴言',
  'Favourites': '收藏',
  'Recently shown': '最近显示过',
  'All': '全部',
  'Nothing yet — tap a ♡ anywhere to keep it.': '还没有——在任意一处点 ♡ 就能收藏。',
  'Nothing shown yet.': '还没有显示过什么。',
  'Show this today': '今天就用这个',
  'Show this wallpaper today': '今天就用这张照片',
  'yours': '自建',
  'Delete this — it is yours': '删除——这是你自己加的',
  'Delete': '删除',
  'Close': '关闭',

  // The nouns the favourite button wraps its verb around (see FavHeart).
  'this mantra': '这句箴言',
  'this quote': '这句话',
  'this wallpaper': '这张照片',

  // ---- Adding your own ----
  '+ Add your own': '+ 添加自己的',
  'The quotation': '引言原文',
  'Two to four words': '四到八个字',
  'Quotation': '引言',
  'Mantra': '箴言',
  'Author (optional)': '出处（可选）',
  'Author': '出处',
  'Add': '添加',
  'Cancel': '取消',
}
