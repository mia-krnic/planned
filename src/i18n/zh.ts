/**
 * Chinese UI strings, keyed by the exact English text they replace (see
 * src/i18n.ts). Grouped by surface; keep a group per page so a missing line
 * is easy to place. Simplified characters, and the app's plain register —
 * short, warm, no exclamation marks the English didn't have.
 *
 * WHOLE-TEMPLATE ENTRIES
 * Most strings translate piecewise: `${n} ${t('due today')}`. Where Chinese
 * word order will not survive that — dates especially, since Chinese leads
 * with the year and hangs 年/月/日 off the numbers — the whole sentence is one
 * entry keyed by its English template, with `{name}` placeholders:
 *
 *   '{month} {day}, {year}': '{year}年{month}{day}日',
 *
 * A three-line `fill(tpl, values)` helper in the component that owns the
 * string substitutes the placeholders. In English `t()` returns the key
 * unchanged, so `fill` rebuilds exactly the string that used to be written
 * inline — English rendering never changes. Helpers currently live in
 * TopBar, MiniMonth, YearView, ProjectTree, WeekGrid, DayLogControls,
 * StudyTimerPage, BinderPage, GradesTab, JournalPage and utils/occur.
 *
 * MONTH NAMES use the numeric Chinese form ('August' and 'Aug' both → '8月').
 * 'May' is its own short form in English, so one key has to serve both
 * places; numeric keeps that consistent instead of mixing 八月 with 5月.
 */
export const ZH: Record<string, string> = {
  // ---- Top bar & navigation ----
  'Calendar': '日历',
  'Tasks': '任务',
  'Timer': '计时',
  'Binder': '资料夹',
  'Insights': '洞察',
  'Journal': '日记',
  'Home': '主页',
  'Today': '今天',
  '+ Event': '+ 日程',
  '+ Task': '+ 任务',
  '+ Log study': '+ 记录学习',
  '+ Log': '+ 记录',
  'study': '学习',
  'Add': '添加',
  'Event': '日程',
  'Task': '任务',
  'Log study': '记录学习',
  'Undo': '撤销',
  'Redo': '重做',
  'Search': '搜索',
  'Notifications': '通知',
  'Settings': '设置',
  'Tools': '工具',
  'Previous': '上一个',
  'Next': '下一个',
  'Day': '日',
  'Week': '周',
  'Month': '月',
  'Year': '年',
  'Search (⌘K)': '搜索（⌘K）',
  'Undo (⌘Z)': '撤销（⌘Z）',
  'Redo (⌘Y)': '重做（⌘Y）',

  // ---- Date range label (TopBar / MiniMonth templates) ----
  '{year}': '{year}年',
  '{month} {year}': '{year}年{month}',
  '{month} {day}, {year}': '{year}年{month}{day}日',
  '{m1} {d1} – {d2}, {year}': '{year}年{m1}{d1}–{d2}日',
  '{m1} {d1} – {m2} {d2}, {year}': '{year}年{m1}{d1}日–{m2}{d2}日',
  'Previous month': '上个月',
  'Next month': '下个月',

  // ---- Month names (display only; utils/date MONTHS stays English) ----
  'January': '1月',
  'February': '2月',
  'March': '3月',
  'April': '4月',
  'May': '5月',
  'June': '6月',
  'July': '7月',
  'August': '8月',
  'September': '9月',
  'October': '10月',
  'November': '11月',
  'December': '12月',
  'Jan': '1月',
  'Feb': '2月',
  'Mar': '3月',
  'Apr': '4月',
  'Jun': '6月',
  'Jul': '7月',
  'Aug': '8月',
  'Sep': '9月',
  'Oct': '10月',
  'Nov': '11月',
  'Dec': '12月',

  // ---- Weekday names (display only; utils/date WEEKDAYS stays English) ----
  'Sun': '周日',
  'Mon': '周一',
  'Tue': '周二',
  'Wed': '周三',
  'Thu': '周四',
  'Fri': '周五',
  'Sat': '周六',
  'Sunday': '星期日',
  'Monday': '星期一',
  'Saturday': '星期六',
  'Tomorrow': '明天',
  'Yesterday': '昨天',
  'today': '今天',
  '+{n} more': '+{n} 项',

  // ---- Settings panel ----
  'View settings': '视图设置',
  'Editing': '编辑',
  'Theme': '主题',
  'Light': '浅色',
  'Dark': '深色',
  'Auto': '自动',
  'Light from': '浅色开始',
  'Dark from': '深色开始',
  'Language': '语言',
  'Week starts on': '每周开始于',
  'Task checking': '任务勾选',
  'Checkbox': '复选框',
  'YPT-style': 'YPT 风格',
  'Reschedule ghosts': '改期残影',
  'Show': '显示',
  'Hide': '隐藏',
  'Location': '位置',
  'Where you are': '你在哪里',
  'Northern hemisphere': '北半球',
  'Southern hemisphere': '南半球',
  'Checkbox is the classic tick. YPT-style replaces it with a three-step glyph — □ not started, ◺ half done, ⊘ done — that you click to cycle. Half-done states survive switching modes: a task you tick off in checkbox mode shows as done here, and anything left half done comes back as ◺. Recurring tasks keep a plain checkbox, since they are ticked off per day.':
    '复选框就是经典的打勾。YPT 风格把它换成三段式图标 — □ 未开始，◺ 做了一半，⊘ 完成 — 点击循环切换。做了一半的状态在切换模式后依然保留：在复选框模式下勾掉的任务，这里显示为完成，留在一半的仍然回到 ◺。重复任务保持普通复选框，因为它们是按天勾选的。',
  'When a scheduled task moves to another day, the slot it left keeps a faint → marker so you can see what slipped. Dismiss single ghosts with their ×; switching this back on brings every dismissed ghost back.':
    '当一个已安排的任务移到别的日子，它原来的位置会留下一个淡淡的 → 标记，让你看到什么被推迟了。用 × 可以单独消除某个残影；把这项重新打开会让所有消除过的残影再回来。',
  'Only used for the moon-phase icon on the daily log: south of the equator the moon is seen the other way round, so the lit side is mirrored. The place name is just a note to yourself — nothing is sent anywhere.':
    '只用于每日记录里的月相图标：在南半球看到的月亮方向相反，亮的一侧会镜像过来。地名只是给你自己看的备注 — 不会发送到任何地方。',

  // ---- Tasks panel ----
  'Upcoming': '即将到来',
  'Projects': '项目',
  'Add task': '添加任务',
  'Expand to full screen': '展开到全屏',
  'Back to calendar': '回到日历',
  'Pinned': '置顶',
  'Due': '截止',
  'Overdue': '逾期',
  'Scheduled': '安排在',
  // Chinese drops the preposition: "安排在 今天 16:00". The run of spaces this
  // leaves in the template collapses in HTML, so no separator is needed.
  'at': '',
  'due': '截止',
  'extended': '已延期',
  'submitted': '已提交',
  'Unpin': '取消置顶',
  'Pin to top': '置顶',
  'This week': '本周',
  'Later': '以后',
  'Someday': '将来某天',
  'Nothing here — add a task with ＋': '这里还没有内容 — 用 ＋ 添加任务',

  // ---- Tasks: natural-language quick add ----
  // The parser only reads English, so the example syntax stays English —
  // only the labels around it are translated.
  'Natural-language quick add': '自然语言快速添加',
  "When on, the quick-add inputs in the projects tree parse things like 'essay draft tue 4pm p:PHIL due fri 17:00 @library' into title/date/time/project/due/location. When off, whatever you type is used verbatim as the title.":
    "打开后，项目树里的快速添加输入框会把 'essay draft tue 4pm p:PHIL due fri 17:00 @library' 这样的内容解析成标题/日期/时间/项目/截止/地点。关闭后，你输入的内容会原样作为标题。",
  'Show syntax': '显示语法',
  'Hide syntax': '隐藏语法',
  'Dates:': '日期：',
  'Times:': '时间：',
  'Due:': '截止：',
  'e.g.': '例如',
  'Project:': '项目：',
  'case-insensitive prefix match': '不区分大小写的前缀匹配',
  'Location:': '位置：',
  'Title:': '标题：',
  'anything unmatched': '其余未匹配的内容',

  // ---- Project tree ----
  'Archive': '归档',
  'Show completed tasks': '显示已完成的任务',
  'Hide completed tasks': '隐藏已完成的任务',
  'Main': '主区',
  'Unfiled': '未归类',
  'Personal': '个人',
  'Assignments': '作业',
  'Add recurring task': '添加重复任务',
  'Add section': '添加分区',
  'Add task in this section': '在此分区添加任务',
  'Rename section': '重命名分区',
  'Delete section': '删除分区',
  'Section name:': '分区名称：',
  'Misc': '杂项',
  'the main list': '主列表',
  'Delete section "{name}"?': '删除分区“{name}”？',
  'Delete section "{name}"? Its tasks will move to {dest}.': '删除分区“{name}”？其中的任务会移到{dest}。',
  'Click to expand · drag to move the section': '点击展开 · 拖动可移动分区',
  'Click to collapse · drag to move the section': '点击折叠 · 拖动可移动分区',
  'Remove the assignments flag': '取消作业标记',
  'Flag as an assignments section': '标记为作业分区',
  'Flagged sections hold graded work and feed the grade tracker. A class can flag as many sections as it likes (Coursework and Lab Reports, say).':
    '被标记的分区存放计分的作业，并作为成绩跟踪的来源。一门课程想标记多少个分区都可以（比如平时作业和实验报告）。',
  'Add a task…  (try: essay tue 4pm p:PHIL due fri 17:00)': '添加任务…（试试：essay tue 4pm p:PHIL due fri 17:00）',
  'Add a task… (unscheduled)': '添加任务…（未安排时间）',
  'Drop here to take a task out of its project': '拖到这里可把任务移出它的项目',

  // ---- Recurring rules (utils/occur describeRule) ----
  'daily': '每天',
  'weekdays': '工作日',
  'weekly': '每周',
  'every other week': '每隔一周',
  'monthly': '每月',
  'day {n}': '{n}日',
  '× a day': ' 次/天',

  // ---- Week grid: lanes & day headers ----
  'Show the daily log': '显示每日记录',
  'Hide the daily log': '隐藏每日记录',
  'log': '记录',
  'Mark as day off': '标为休息日',
  'Unmark day off': '取消休息日',
  'This day has an exam scheduled — it can\'t be marked as a day off.': '这天有考试安排 — 不能标为休息日。',
  'Show all-day items': '显示全天项目',
  'Collapse all-day items': '收起全天项目',
  'all-day': '全天',
  'all-day item': '个全天项目',
  'all-day items': '个全天项目',
  'click to expand': '点击展开',
  'Click to expand': '点击展开',
  'Show habit goals': '显示习惯目标',
  'Collapse habit goals': '收起习惯目标',
  'habits': '习惯',
  'No habit goals yet — add them in the month or year view.': '还没有习惯目标 — 可在月视图或年视图中添加。',
  'No goals': '没有目标',
  'Show journal boxes': '显示日记框',
  'Collapse journal boxes': '收起日记框',
  'Has an entry': '有记录',
  '{done} of {total} ticked': '已勾选 {done}/{total}',

  // ---- Week grid: blocks, deadlines, drag ----
  'Drag to change the length': '拖动可改变时长',
  'Moved away from': '已移出',
  'Dismiss this ghost': '不再显示这个残影',
  'EXAM': '考试',
  'DUE': '截止',
  'Was due': '原定截止',
  'extension granted': '已延期',
  'Study session': '学习时段',
  'now': '现在',
  'Study log': '学习记录',

  // ---- Sidebar: calendars & classes ----
  'My calendars': '我的日历',
  'Calendars': '日历',
  'Add calendar': '添加日历',
  'Edit calendar': '编辑日历',
  'Birthdays': '生日',
  'Add a birthday': '添加生日',
  'Edit birthdays': '编辑生日',
  'Classes': '课程',
  'Class': '课程',
  'Add class': '添加课程',
  'Edit class': '编辑课程',
  'Add class to': '添加课程到',
  'Add folder': '添加文件夹',
  'Rename folder': '重命名文件夹',
  'Delete folder': '删除文件夹',
  'Delete folder (classes stay)': '删除文件夹（课程保留）',
  'Its classes stay, just unfoldered.': '其中的课程会保留，只是不再归入文件夹。',
  'Folder name…': '文件夹名称…',
  'Move to the end': '移到末尾',
  'Drop a class here to remove it from its folder': '把课程拖到这里，可移出文件夹',

  // ---- Sidebar: backup ----
  'Backup': '备份',
  'Import live ICS': '导入在线 ICS',
  'Live ICS': '在线 ICS',
  'Import ICS file': '导入 ICS 文件',
  'ICS file': 'ICS 文件',
  'App data': '应用数据',
  'Export data': '导出数据',
  'Export': '导出',
  'Import data': '导入数据',
  'Import': '导入',
  'Import failed': '导入失败',
  'Importing a backup replaces ALL current data. Continue?': '导入备份会替换当前的全部数据。继续吗？',
  'No events found in that file — are you sure it\'s an .ics calendar?': '这个文件里没有找到日程 — 确定它是 .ics 日历吗？',
  'Replace everything with the example data': '用示例数据替换全部内容',
  'Example data': '示例数据',
  'Load the example data? Everything currently here is replaced — export a backup first if you might want it back.':
    '载入示例数据？当前的全部内容会被替换 — 如果之后可能还需要，请先导出备份。',
  'Delete all data': '删除全部数据',
  'Are you sure you want to clear all data? This removes every event, task, project, class and binder file. Export a backup first if you might want it back.':
    '确定要清除全部数据吗？这会删除所有日程、任务、项目、课程和资料夹文件。如果之后可能还需要，请先导出备份。',

  // ---- Urgent banners ----
  'Show what is due today': '查看今天截止的任务',
  'Hide the list': '收起列表',
  'due today': '今天截止',
  'Not done, not submitted': '未完成，也未提交',
  'Done — not submitted yet': '已完成 — 还未提交',
  'Submitted — not ticked off yet': '已提交 — 还未勾选完成',

  // ---- Daily log: weather & moon ----
  'Sunny': '晴',
  'Sun and cloud': '晴间多云',
  'Cloudy': '多云',
  'Rain': '雨',
  'Storm': '雷雨',
  'Snow': '雪',
  'Windy': '有风',
  'New moon': '新月',
  'Waxing crescent': '娥眉月',
  'First quarter': '上弦月',
  'Waxing gibbous': '盈凸月',
  'Full moon': '满月',
  'Waning gibbous': '亏凸月',
  'Last quarter': '下弦月',
  'Waning crescent': '残月',

  // ---- Daily log: meals, water, mood, sleep ----
  'Breakfast': '早餐',
  'Lunch': '午餐',
  'Dinner': '晚餐',
  'Glasses of water': '喝水杯数',
  'Shower': '洗澡',
  'Brush teeth': '刷牙',
  'Rough day': '很糟的一天',
  'Not great': '不太好',
  'Okay': '一般',
  'Good': '不错',
  'Great day': '很棒的一天',
  'Hours slept last night': '昨晚睡了多久',
  'Weight this morning (kg)': '今早体重（公斤）',
  'Weight this morning in kilograms': '今早体重（公斤）',
  'How was today?': '今天过得怎么样？',
  'Journal entry': '日记内容',
  'Water · {n} of {max}': '喝水 · {n}/{max}',
  'Brush teeth · {n} of {max}': '刷牙 · {n}/{max}',

  // ---- Study timer: set-up dial ----
  'Study timer': '学习计时',
  'Focus length': '专注时长',
  'Break length': '休息时长',
  'minutes': '分钟',
  'min': '分钟',
  'focus': '专注',
  'min break': '分钟休息',
  'or drag the rings': '或拖动圆环',
  'The outer ring sets the focus length — one full lap is 2 hours. The inner ring sets the break — one lap is 1 hour. Both snap to 5 minutes, and arrow keys nudge whichever ring has keyboard focus.':
    '外圈设置专注时长 — 转满一圈是 2 小时。内圈设置休息 — 一圈是 1 小时。两者都按 5 分钟对齐，方向键可以微调当前获得键盘焦点的那一圈。',
  'Free-running': '自由计时',
  'No set rhythm — pause whenever you say so.': '没有固定节奏 — 想休息时随时暂停。',
  '← back to the pomodoro dial': '← 回到番茄转盘',
  'or free-run, breaks when you say so →': '或自由计时，想休息时随时休息 →',
  'A study session belongs to a class, or to nothing at all. “Unassigned” time is still counted — it just isn\'t attributed to a class.':
    '一个学习时段属于某门课程，或者什么都不属于。“未分配”的时间同样会被统计 — 只是没有归到某门课程上。',
  'Tasks to work on (optional)': '要做的任务（可选）',
  'Unfiled tasks (optional)': '未归类的任务（可选）',
  'No open tasks in this class.': '这门课程没有未完成的任务。',
  'No unfiled tasks.': '没有未归类的任务。',
  'Start studying': '开始学习',
  'start studying': '开始学习',
  'Custom pomodoro': '自定义番茄钟',
  'Pomodoro 25/5': '番茄钟 25/5',
  'Pomodoro 50/10': '番茄钟 50/10',
  'Normal': '普通',
  '{work} minutes of focus, {brk} of break': '{work} 分钟专注，{brk} 分钟休息',
  'a sitting is {n} focus sessions · {total} in all': '一轮是 {n} 个专注时段 · 共 {total}',

  // ---- Study timer: running ----
  'started': '开始于',
  '⏸ Paused': '⏸ 已暂停',
  '◌ Break': '◌ 休息',
  '◉ Work': '◉ 专注',
  'so far': '已过',
  'until work': '后开始专注',
  'until break': '后开始休息',
  'session {n} of {total}': '第 {n} 个时段，共 {total} 个',
  'Now studying': '正在学习',
  'studying now': '正在学习',
  'Picking a class continues this session with it from now on — the time before the switch stays where it was, with the class you were on. The bar shows the split so far; fine-tune the switch times under “Adjust times”.':
    '选择一门课程会让这个时段从现在起继续学它 — 切换之前的时间保持不变，仍算在原来的课程上。上面的条显示了目前的分配；在“调整时间”里可以微调切换时刻。',
  'Picking another class adds to the bar — earlier time stays where it was.': '选择别的课程会往条上添加一段 — 之前的时间保持不变。',
  'Switch class': '切换课程',
  'Continue with {label} from now — earlier time stays where it was': '从现在起继续学习 {label} — 之前的时间保持不变',
  'Unassigned': '未分配',
  'Working on': '正在进行的待办',
  'To-dos you are working through this session. Tick one to mark it done, × to unlink it.':
    '这个时段里你要完成的待办。勾选表示完成，× 取消关联。',
  'Unlink from this session': '从本时段取消关联',
  '+ Link a to-do': '+ 关联待办',
  'Search to-dos…': '搜索待办…',
  'No open to-dos match.': '没有匹配的未完成待办。',
  'Link binder files (optional) — notes you made or handouts you revised': '关联资料夹文件（可选）— 你做的笔记或复习的讲义',
  'Reflection': '复盘',
  'How is it going? Notes for next time…': '进展如何？给下次的备注…',
  'Adjust times': '调整时间',
  'Start time': '开始时间',
  'Classes studied — start time of each switch': '学习的课程 — 每次切换的开始时间',
  'Breaks': '休息',
  'Pomodoro breaks are automatic while running — editable after you end the session.': '番茄钟运行时休息是自动的 — 结束时段后可以编辑。',
  'Resume studying': '继续学习',
  'Pause studying': '暂停学习',
  'Resume — the clock starts again': '继续 — 计时重新开始',
  'Pause — the clock stops and the time counts as a break': '暂停 — 计时停止，这段时间算作休息',
  'paused': '已暂停',
  'tap to resume': '点按继续',
  'pause': '暂停',
  'The timer runs off the clock, not a countdown — switch pages or reload and it keeps going.': '计时按真实时钟走，不是倒计时 — 切换页面或刷新它都继续。',

  // ---- Study timer: daily goal ----
  'Daily goal': '每日目标',
  'not set': '未设置',
  'Set a goal': '设置目标',
  '90 or 1:30': '90 或 1:30',
  'Minutes (90) or hours:minutes (1:30)': '分钟（90）或 时:分（1:30）',
  'Edit': '编辑',
  'Clear': '清除',
  'Save': '保存',
  'Cancel': '取消',
  'Your daily study target, in focused minutes (breaks do not count). It is what the Insights page measures your Target Achievement Rate against — the share of days you hit this goal. Clear it to stop tracking.':
    '你的每日学习目标，以专注分钟计（休息不计入）。洞察页的目标达成率就是按它来算的 — 达成这个目标的天数占比。清除它就不再跟踪。',

  // ---- Study timer: ending a session ----
  'End session': '结束时段',
  'End this study session?': '结束这个学习时段？',
  '✓ Session ended': '✓ 时段已结束',
  'Session ended — keep this log?': '时段已结束 — 保留这条记录吗？',
  'Delete log': '删除记录',
  'Keep log': '保留记录',
  'Session finished': '时段已完成',
  'How did it go? Notes for next time…': '感觉怎么样？给下次的备注…',
  'Skip': '跳过',

  // ---- Session editors: breaks, switches, binder links ----
  'Why the break?': '为什么休息？',
  'Tag this break': '标记这次休息',
  'tag…': '标记…',
  'untagged': '未标记',
  'rest': '休息',
  'meal': '吃饭',
  'restroom': '洗手间',
  'other': '其他',
  'No breaks logged.': '没有记录休息。',
  'Remove break': '删除休息',
  '+ Add break': '+ 添加休息',
  'The first slice always starts with the session': '第一段总是与时段同时开始',
  'Remove this switch': '删除这次切换',
  '+ Add switch': '+ 添加切换',
  'No binder files in this class yet.': '这门课程还没有资料夹文件。',
  'Pick a class to link its binder files.': '选择一门课程来关联它的资料夹文件。',
  'Linked earlier in this session': '本时段中较早关联的',
  'other class': '其他课程',
  'Unlink': '取消关联',

  // ---- Binder: index page & class nav ----
  'My binder': '我的资料夹',
  'Posts, notes, handouts and resources — one page per class. Drag cards to rearrange or refolder.':
    '动态、笔记、讲义和资料 — 每门课程一页。拖动卡片可以重新排序或换文件夹。',
  'Expand class list': '展开课程列表',
  'Collapse class list': '收起课程列表',
  'All classes': '全部课程',
  'Drag to reorder folders': '拖动可调整文件夹顺序',
  'No classes yet — add one in the calendar sidebar and its binder page appears here.':
    '还没有课程 — 在日历侧栏添加一门，它的资料夹页面就会出现在这里。',
  '+ Add class': '+ 添加课程',
  'Unpin from top of binder': '取消置顶于资料夹',
  'Pin to top of binder': '置顶到资料夹',
  'Unpin from top of folder': '取消置顶于文件夹',
  'Pin to top of its folder': '置顶到所在文件夹',
  'post': '条帖子',
  'posts': '条帖子',
  'file': '个文件',
  'files': '个文件',

  // ---- Binder: class page head & details ----
  'Stream': '动态',
  'Collation': '整理',
  'Grades': '成绩',
  '+ Upload': '+ 上传',
  'Professor': '教师',
  'e.g. Dr M. Sinclair': '例如：辛克莱博士',
  'Room': '教室',
  'e.g. MS.01': '例如：MS.01',
  'Homework': '作业',
  'e.g. problem sheet due Fridays': '例如：习题每周五截止',
  'Other important info': '其他重要信息',
  'Anything else worth keeping at the top — office hours, textbook, marking scheme…':
    '其他值得放在最上面的内容 — 答疑时间、教材、评分方式…',
  'This class has no project yet.': '这门课程还没有项目。',

  // ---- Binder: stream tab ----
  'Post': '发布',
  'Post to the {class} stream — a reminder, a thought, anything…': '发布到 {class} 的动态 — 提醒、想法，什么都行…',
  'Nothing in the stream yet — post a note or add an upload.': '动态里还没有内容 — 发一条笔记或添加一个上传。',
  'Unpin from stream': '取消置顶于动态',
  'Pin to top of stream': '置顶到动态',
  'Edit post': '编辑帖子',
  'Delete post': '删除帖子',
  'Delete this post?': '删除这条帖子？',

  // ---- Binder: collation sections & upload cards ----
  'New section name…': '新分区名称…',
  '+ Add section': '+ 添加分区',
  '+ Upload here': '+ 在此上传',
  'Nothing here yet.': '这里还没有内容。',
  'Unpin from top of section': '取消置顶于分区',
  'Pin to top of section': '置顶到分区',
  'Unpin from the collation tab': '取消置顶于整理页',
  'Pin to top of the collation tab': '置顶到整理页',
  'Attached to an event': '已附加到日程',
  'Attached to a task': '已附加到任务',
  'Edit upload': '编辑上传',
  'added': '添加于',
  'Delete section "{name}"? Its {n} upload(s) move to another section.': '删除分区“{name}”？它的 {n} 个上传会移到其他分区。',

  // ---- Binder: grades tab ----
  'Current grade': '当前成绩',
  'Running total': '累计得分',
  'Marked so far': '已评分',
  'of the course': '的课程',
  "The weights you've typed already add up to": '你填写的权重加起来已经是',
  '% — more than the whole course, so the blank rows are left with nothing.': '% — 超过了整门课程，所以留空的行分不到任何权重。',
  '% — more than the whole course.': '% — 超过了整门课程。',
  'Component': '部分',
  'Weight': '权重',
  'Score': '分数',
  'Documents': '文档',
  'Component name': '部分名称',
  'auto': '自动',
  'Weight as a % of the course': '占整门课程的权重百分比',
  'What you scored, as a %': '你的得分，以百分比表示',
  'Done': '已完成',
  'Submitted': '已提交',
  'Unbind from this row': '从这一行解除绑定',
  '+ Bind': '+ 绑定',
  'Search assignments…': '搜索作业…',
  'No assignments match.': '没有匹配的作业。',
  'No tasks in an assignments-flagged section of this class yet.': '这门课程还没有任务被放在标记为作业的分区里。',
  'undated': '无日期',
  'Delete this row': '删除这一行',
  '+ Add row': '+ 添加行',
  'Delete the "{name}" row?': '删除“{name}”这一行？',
  'Add a row for each assessed component — midterm, lab reports, final — and this tab keeps your running grade for {class}.':
    '为每个考核部分添加一行 — 期中、实验报告、期末 — 这个标签页会为你记录 {class} 的实时成绩。',
  'Leave a weight blank and the row shares whatever is left of 100% evenly with the other blank rows. Type 40 into one row and leave three blank, and each of those three is worth 20.':
    '权重留空的行会和其他留空的行平分 100% 剩下的部分。在一行填 40，另外三行留空，那三行各占 20。',
  "The weighted average of the components you've entered a score for — where you stand if the course stopped today. Components with no score yet are left out of the maths entirely.":
    '你已经填了分数的那些部分的加权平均 — 如果课程今天结束，你就在这个位置。还没有分数的部分完全不参与计算。',
  'Marks already banked towards the final 100, i.e. each scored component times its weight. It only climbs as more work is marked.':
    '已经计入最终 100 分的分数，也就是每个已评分部分乘以它的权重。随着更多作业被评分，它只会上升。',
  'The binder uploads attached to this row’s assignments. Attach a file on the task itself and it appears here — there is deliberately no separate place to file documents against a grade.':
    '这一行的作业上附加的资料夹上传。在任务本身附加文件，它就会出现在这里 — 这里刻意没有单独为成绩归档文件的地方。',

  // ---- Binder: upload modal ----
  'New upload': '新建上传',
  'Title': '标题',
  'e.g. "Week 2 resources", "Seminar 5 notes"': '例如：“第二周资料”“研讨课 5 笔记”',
  'Section': '分区',
  'Files': '文件',
  'Remove file': '移除文件',
  '+ Add files…': '+ 添加文件…',
  'Caption / notes (optional)': '说明 / 备注（可选）',
  'e.g. Make sure to bring textbook X!': '例如：记得带教材 X！',
  'Attach to an event or task (optional — dates the upload)': '附加到日程或任务（可选 — 会为上传标注日期）',
  'Not attached': '未附加',
  'Task:': '任务：',
  'Delete': '删除',
  'Saving…': '保存中…',
  'Add upload': '添加上传',
  'Delete "{name}" and its {n} file(s)?': '删除“{name}”及其 {n} 个文件？',

  // ---- Binder: task attachments & file chips ----
  'Nothing attached.': '没有附加内容。',
  'Detach from this task': '从这个任务移除',
  '+ Attach from binder': '+ 从资料夹附加',
  'Search the binder…': '搜索资料夹…',
  '+ Upload new to binder': '+ 上传新文件到资料夹',
  'No uploads match.': '没有匹配的上传。',
  'This class has no binder uploads yet.': '这门课程还没有资料夹上传。',
  'Open': '打开',
  'Download': '下载',
  'no files': '无文件',

  // ---- Journal ----
  'Search meals and entries': '搜索饮食和日记',
  'Search the journal': '搜索日记',
  'Nothing written down yet.': '还没有写下任何内容。',
  'Every day in the week and day calendar views carries a small log at the foot of its header: tap the weather, jot what you ate, pick a face for how it went. Scroll past the last hour of a day for its journal box.':
    '周视图和日视图里每一天的标题下方都有一条小记录：点一下天气，写下吃了什么，选一张脸表示这天过得怎么样。把一天滚动到最后一个小时之后，就能看到它的日记框。',
  'It all lands here, newest first — the rows below are editable too.': '这些都会汇总到这里，最新的在最前 — 下面的每一行也可以直接编辑。',
  'day': '天',
  'days': '天',
  'Hours slept': '睡眠时长',
  '☾ sleep': '☾ 睡眠',
  'slept': '睡眠',
  'no sleep logged': '未记录睡眠',
  '— drag to set': '— 拖动设置',
  'Morning weight': '晨起体重',
  '⚖ kg': '⚖ 公斤',
  'kg': '公斤',
  'no weigh-in': '未称重',
  '{n} day logged · {w} written up': '已记录 {n} 天 · 写了 {w} 篇',
  '{n} days logged · {w} written up': '已记录 {n} 天 · 写了 {w} 篇',
  '{month} moods': '{month}心情',
  'No entries match “{q}”.': '没有条目匹配 “{q}”。',
  '{n} day match “{q}”.': '有 {n} 天匹配 “{q}”。',
  '{n} days match “{q}”.': '有 {n} 天匹配 “{q}”。',
  '{n} logged': '已记录 {n} 天',
  '{day} {month}': '{month}{day}日',

  // ---- Colour palettes ----
  'Colour palettes': '配色方案',
  'Palettes': '配色',
  'Recolour every class in': '把所有课程配色改为',
  'Classic': '经典',
  'Fall': '秋日',
  'Ocean': '海洋',
  'Spring': '春日',
  'Berry': '莓果',
  'Forest': '森林',
  'Sunset': '日落',
  'Lavender dusk': '薰衣草暮色',
  'Slate': '石板灰',
  "One click recolours every class and swings the app's accent colour to match — Classic puts the classes back on the default palette and hands the accent back to the theme. Class colours you set yourself are overwritten, so undo (⌘Z) if you want them back: a whole bundle reverts in one step.":
    '一键为所有课程重新配色，并把应用的强调色调成相配的颜色 — 经典会把课程恢复为默认配色，并把强调色交还给主题。你自己设过的课程颜色会被覆盖，想找回就撤销（⌘Z）：整套配色一步就能还原。',

  // ---- Year view: year goals ----
  'Year goals run the whole year and trickle down into every month and week grid. Each square is a day — click it to tick it. The figure by the name is the share of the days lived so far that you ticked.':
    '年度目标贯穿整年，并会向下体现在每个月视图和周视图里。每个方块代表一天 — 点击即可勾选。名字旁边的数字是你已经度过的日子里勾选的比例。',
  'no year goals yet': '还没有年度目标',
  '{n} year goal{s}': '{n} 个年度目标',
  'This year has not started yet': '今年还没有开始',
  // Shared by the year view and the month habit gantt — one key, one wording.
  '{done} of {elapsed} days so far': '至今 {elapsed} 天中完成 {done} 天',
  'No year goals yet — add one below.': '还没有年度目标 — 在下面添加一个。',
  '+ Add year goal': '+ 添加年度目标',
  'Add a year goal for {year}': '为 {year} 年添加年度目标',

  // ---- Habit goals (month gantt) ----
  'Habits': '习惯',
  'Show the habit gantt': '显示习惯甘特图',
  'Collapse the habit gantt': '收起习惯甘特图',
  'Rename goal': '重命名目标',
  'Promote to a recurring task': '转为重复任务',
  'task': '任务',
  'Delete goal': '删除目标',
  'Goal name': '目标名称',
  'no goals': '没有目标',
  'This month has not started yet': '这个月还没有开始',
  'Nothing tracked this month yet.': '本月还没有跟踪任何目标。',
  "Carry over last month's goals": '沿用上月的目标',
  '+ Add goal': '+ 添加目标',
  '+ year goal': '+ 年度目标',
  'One row per goal, one column per day of the month. Year goals (⟳) trickle down into every month; the rest belong to this month alone and start fresh next month. The figure on the right is the share of the days lived so far that you ticked.':
    '每个目标一行，本月每天一列。年度目标（⟳）会出现在每个月里；其余目标只属于本月，下个月重新开始。右侧的数字是已经过去的日子里你打勾的比例。',
  'Delete goal "{title}"? Its ticks go with it.': '删除目标“{title}”？它的打勾记录也会一并删除。',
  'Year goal — shows in every month of {period}': '年度目标 — 会出现在 {period} 的每个月',
  '{n} goal': '{n} 个目标',
  '{n} goals': '{n} 个目标',
  '{done}/{total} today': '今天 {done}/{total}',
  'Recreate the {n} goal of {period} for this month': '把 {period} 的 {n} 个目标复制到本月',
  'Recreate the {n} goals of {period} for this month': '把 {period} 的 {n} 个目标复制到本月',
  'Add a goal for {month}': '为{month}添加目标',
  'File what you typed as a year goal instead — it shows in every month of {year}':
    '把输入的内容记为年度目标 — 它会出现在 {year} 年的每个月',

  // ---- Flashcard (Anki) tracker ----
  'General': '通用',
  'All decks': '全部卡组',
  'Deck': '卡组',
  'Filter by deck': '按卡组筛选',
  'Flashcard reviews': '卡片复习',
  'Show the review tracker': '显示复习记录',
  'Hide the review tracker': '隐藏复习记录',
  'cards': '卡片',
  'day streak': '连续天数',
  'best day': '最佳单日',
  'daily avg': '日均',
  '30 days': '30天',
  '100 days': '100天',
  'All': '全部',
  'Continuous strip': '连续条带',
  'Strip': '条带',
  'Separate month blocks': '按月分块',
  'Months': '月份',
  'less': '少',
  // The heatmap legend's "less … more". The month grid's "+3 more" is a
  // separate template key, so this one is free to be the legend's word.
  'more': '多',
  'Day to log': '记录日期',
  'Cards reviewed': '复习卡片数',
  'Increase': '增加',
  'Decrease': '减少',
  'Log': '记录',
  'Logging sets the total for that day and deck.': '记录的是那一天该卡组的总数。',
  '{when} — {n} card': '{when} — {n} 张卡片',
  '{when} — {n} cards': '{when} — {n} 张卡片',
  '{when} — no reviews': '{when} — 没有复习',
  'Flashcard reviews — last {n} weeks. Click to open the tracker.': '卡片复习 — 最近 {n} 周。点击打开记录面板。',
  '{n} cards': '{n} 张卡片',
  '{n}-day streak': '连续 {n} 天',
  '{n} cards · {streak}-day streak': '{n} 张卡片 · 连续 {streak} 天',
  'Already logged: {n} cards — logging replaces it (0 clears the day).':
    '已记录：{n} 张卡片 — 再次记录会覆盖它（填 0 清空当天）。',

  // ---- Exam countdown ----
  'Exams': '考试',
  '{h}h': '{h}小时',
  '{h}h {m}m': '{h}小时{m}分',
  '{m}m': '{m}分',

  // ---- Insights: page shell & controls ----
  'Study sessions & daily log': '学习时段与每日记录',
  'Interval': '区间',
  'Duration unit': '时长单位',
  'Show durations as hours and minutes': '以小时和分钟显示时长',
  'Show durations in minutes': '以分钟显示时长',
  'hrs': '小时',
  'mins': '分钟',
  'Past day': '过去一天',
  'Past week': '过去一周',
  'Past month': '过去一个月',
  'Past year': '过去一年',
  'All time': '全部时间',
  'Productivity insights': '效率洞察',
  'Study sessions & time at the desk': '学习时段与伏案时间',
  'Journal insights': '日记洞察',
  'Journalling': '写日记',
  'Mood': '心情',
  'Daily avg': '日均',
  'sleep': '睡眠',
  'all': '全部',
  'From your daily log': '来自你的每日记录',
  'Collapse': '收起',
  'Expand': '展开',
  'Scope': '范围',

  // ---- Insights: interval nouns & phrases ----
  'the last 7 days': '最近 7 天',
  'the last 30 days': '最近 30 天',
  'the last 100 days': '最近 100 天',
  'the last 365 days': '最近 365 天',
  'all time': '全部时间',
  'everything you have logged': '你记录过的全部内容',
  'in today': '在今天',
  'in the last 7 days': '在最近 7 天内',
  'in the last 30 days': '在最近 30 天内',
  'in the last 365 days': '在最近 365 天内',
  'across all time': '在全部时间里',

  // ---- Insights: core stats ----
  'Core Time Statistics': '核心时间统计',
  'Total study time': '学习总时长',
  'breaks excluded': '不含休息',
  'Daily average': '日均',
  'Total study time divided by every day in the interval ({n} {days}{extra}), including days with nothing logged.':
    '学习总时长除以区间内的每一天（{n} {days}{extra}），包括没有记录的日子。',
  ', counted from your first logged day': '，从你第一天有记录时算起',
  'per day': '每天',
  'Target achievement rate': '目标达成率',
  'Set a daily study goal in the study timer to track this.': '在学习计时里设定每日学习目标，就能看到这项。',
  'No study time recorded in this interval.': '这个区间内没有学习记录。',
  'n/a %': '暂无',
  'n/a': '暂无',
  '{done} of {total} {days} hit {goal}': '{total} {days}中有 {done} 天达到 {goal}',
  'days meeting the daily goal': '达到每日目标的天数',
  'Maximum continuous focus': '最长连续专注',
  'The longest stretch studied without pausing. Breaks end a stretch; switching class mid-session does not.':
    '不间断学习的最长一段。休息会结束一段专注；中途切换课程不会。',
  'longest unbroken stretch': '最长不间断时段',
  'No study time logged {span} — start a session in the study timer.': '{span}没有学习记录 — 在学习计时里开始一个时段。',

  // ---- Insights: subject & task breakdown ----
  'Subject & Task Breakdown': '课程与任务分布',
  'Chart style': '图表样式',
  'Pie': '饼图',
  'Donut': '环形图',
  'No study time to break down yet.': '还没有可以分解的学习时间。',
  'Study time per class': '各课程学习时间',
  'Total': '总计',
  'Share': '占比',
  'To-do completion rate': '待办完成率',
  'Tasks scheduled on a day {span} — how many of them are ticked off. Tasks with no date, and tasks scheduled outside the interval, are not counted.':
    '{span}安排在某一天的任务 — 其中有多少已勾选完成。没有日期的任务，以及安排在区间之外的任务，都不计入。',
  'planned tasks checked off': '已勾选的计划任务',
  'no tasks planned in this interval': '这个区间内没有计划任务',

  // ---- Insights: class day bars ----
  'The interval broken up day by day, each bar split into the classes studied that day (grey is time not assigned to a class). Bar heights use the same scale as the axis on the left. Past year and All time are grouped into calendar months, since a bar per day would be unreadable — and a long all-time history scrolls sideways rather than thinning its bars away.':
    '把区间按天拆开，每根柱子按当天学习的课程分段（灰色是未分配到课程的时间）。柱高与左侧坐标轴同一刻度。过去一年和全部时间会按自然月归组，因为每天一根柱子会看不清 — 很长的全部时间历史会横向滚动，而不是把柱子挤成细线。',
  'Study time by class, per month': '各课程学习时间（按月）',
  'Study time by class, per day': '各课程学习时间（按天）',
  'No study time {span} to break down by month.': '{span}没有学习时间，无法按月分解。',
  'No study time {span} to break down by day.': '{span}没有学习时间，无法按天分解。',
  'Study time per month, stacked by class': '每月学习时间，按课程堆叠',
  'Study time per day, stacked by class': '每天学习时间，按课程堆叠',

  // ---- Insights: timeline & patterns ----
  'Timeline & Patterns': '时间线与规律',
  'Peak productivity hours': '高效时段',
  'For each hour of the day, the mean number of minutes studied in that hour across all {n} {days} of the interval — days with nothing logged pull the mean down.':
    '一天中每个小时的平均学习分钟数，按区间内全部 {n} {days}计算 — 没有记录的日子会把平均值拉低。',
  'No study time {span}, so there is no hourly pattern yet.': '{span}没有学习时间，所以还看不出小时规律。',
  'Mean study minutes by hour of day': '按小时的平均学习分钟数',
  'on average': '平均',
  'Chronological timeline': '时间顺序时间线',
  'Today, hour by hour: each row is one hour, with a box per ten minutes to read the times off. Each stretch of time is drawn as one strip over that grid, starting and ending at the exact minute — solid in the class colour for studying, faded for a break.':
    '今天，一小时一行：每一行是一个小时，每十分钟一个方格，方便读出时间。每一段时间在网格上画成一条，起止精确到分钟 — 学习是课程颜色的实色，休息则是淡色。',
  'Nothing logged today yet.': '今天还没有记录。',
  'studying': '学习中',
  'break': '休息',

  // ---- Insights: start & end scatter ----
  'Start & end times': '开始与结束时间',
  'One pair of dots per day that has study time on it: the grey dot is when the first session of that day began, the accent dot when the last one ended. Left to right is the time of day; up the chart is how much was studied that day, so a dot high up is a long day. The dashed lines are the mean start and the mean end across the interval. Days with nothing logged are not plotted.':
    '每个有学习时间的日子一对点：灰点是当天第一个时段开始的时刻，彩点是最后一个时段结束的时刻。横轴是一天中的时间；纵轴是当天学了多久，所以位置越高的点代表越长的一天。虚线是区间内的平均开始和平均结束时间。没有记录的日子不会画出来。',
  'No day {span} has study time on it yet, so there are no start or end times to plot.':
    '{span}还没有哪一天有学习时间，所以没有开始或结束时间可画。',
  "First session start and last session end per day, against that day's study time":
    '每天第一个时段的开始与最后一个时段的结束，对照当天的学习时间',
  'avg start': '平均开始',
  'avg end': '平均结束',
  'ended': '结束于',
  'studied': '已学习',
  'First start': '最早开始',
  'Last end': '最晚结束',
  'with study time': '有学习时间',

  // ---- Insights: break analytics ----
  'Break & Distraction Analytics': '休息与分心分析',
  'Total break duration': '休息总时长',
  'Time spent paused inside a study session — pomodoro breaks included. This time is never counted as study time.':
    '学习时段中暂停的时间 — 包括番茄钟的休息。这段时间从不计入学习时间。',
  'of time at the desk': '的伏案时间',
  'Break frequency': '休息次数',
  '{pauses} {span}': '{pauses}，{span}',
  'pauses': '次暂停',
  'Break tag categories': '休息标签分类',
  'Tag your breaks when pausing the timer to see this breakdown.': '暂停计时时给休息打标签，就能看到这份分解。',
  'Untagged': '未标记',
  // Capitalised forms of the break tags; the lowercase stored values are
  // translated under the session editors above and must read the same.
  'Rest': '休息',
  'Meal': '吃饭',
  'Restroom': '洗手间',
  'Other': '其他',

  // ---- Insights: heatmaps card ----
  'Heatmaps': '热力图',
  '▦ Study time': '▦ 学习时间',
  '▦ Anki reviews': '▦ Anki 复习',
  'Both grids follow the interval chosen at the top of the page — "{ival}" shows {span}.':
    '两个网格都跟随页面顶部选择的区间 — “{ival}”显示{span}。',
  'Past day and Past week share the 30-day grid, since a heatmap of a single day would be one square. Layout, class scope and deck filter are per-tab and stay where you left them.':
    '过去一天和过去一周共用 30 天的网格，因为一天的热力图只会是一个方块。布局、课程范围和牌组筛选各标签页独立，会保持你上次的选择。',

  // ---- Insights: study heatmap ----
  'Overall': '总体',
  'no study time': '没有学习时间',
  '▤ Strip': '▤ 条带',
  '▥ Months': '▥ 月份',
  'Minutes studied per day, breaks excluded.': '每天的学习分钟数，不含休息。',
  'Built from your study sessions only — a session split across classes counts towards each class for the part it covered. Pick a class above to shade the grid in its colour.':
    '只根据你的学习时段生成 — 跨课程的时段会按各自覆盖的部分分别计入。在上方选一个课程，网格就会用它的颜色着色。',
  'No study time in this range yet — the grid fills in as you use the timer.': '这个范围内还没有学习时间 — 用计时记录后网格就会填上。',

  // ---- Insights: weekly momentum ----
  'Weekly momentum': '每周势头',
  'Unlike the rest of this page, which reports on a rolling 7-day window ending today, this card covers the current calendar week — the week starting on your chosen first weekday and containing today.':
    '本页其他部分统计的是截至今天的滚动 7 天窗口，这张卡片不同：它统计的是当前的自然周 — 从你设定的每周第一天开始、包含今天的那一周。',
  "Nothing logged this calendar week or the one before it — start a session in the study timer and this week's progress will show up here.":
    '本自然周和上一周都没有记录 — 在学习计时里开始一个时段，本周的进度就会出现在这里。',
  'Total time': '总时长',
  'Time studied so far this calendar week, breaks excluded. Time not assigned to a class still counts.':
    '本自然周到目前为止的学习时间，不含休息。未分配到课程的时间也算在内。',
  'so far this week': '本周至今',
  "This week's total divided by the {n} {days} elapsed so far — today included, the days still to come are not.":
    '本周总时长除以已经过去的 {n} {days} — 今天算在内，还没到的日子不算。',
  'over {n} {days} so far': '至今共 {n} {days}',
  'Cumulative vs last week': '与上周的累计对比',
  "Study time added up as the week goes: each step is one day's running total. Grey is last week, all seven days; the accent line is this week and stops at today. The figure above is the gap between the two at the same point in the week.":
    '一周内累加的学习时间：每一级台阶是当天的累计。灰色是上周的完整七天；彩色线是本周，止于今天。上方的数字是两周在同一时点的差距。',
  'As of {day}': '截至{day}',
  'vs last week': '对比上周',
  'Cumulative study time this calendar week compared with last week': '本自然周与上周的累计学习时间对比',
  'Last week': '上周',
  'Daily total, start & finish': '每日总量、开始与结束',
  "Bars are the minutes studied each day of this calendar week. Over them, two dot-to-dot lines track when each day began and ended: the first session's start and the last session's finish. Later times sit higher, so the gap between the lines is the span of the day. Days with nothing logged get no dots.":
    '柱子是本自然周每天的学习分钟数。柱子上方两条连点线记录每天的起止：第一个时段的开始与最后一个时段的结束。时间越晚位置越高，所以两条线之间的距离就是一天的跨度。没有记录的日子不会有点。',
  "Study minutes per day this calendar week, with each day's first start and last finish time":
    '本自然周每天的学习分钟数，以及每天最早开始与最晚结束的时间',
  'Finish time': '结束时间',
  'Studied': '已学习',
  'No sessions logged yet this calendar week, so there are no start or finish times to plot.':
    '本自然周还没有记录时段，所以没有开始或结束时间可画。',

  // ---- Insights: quarter weeks ----
  'Weeks this quarter': '本季度各周',
  'Each cell is one calendar week of the quarter — the week-start date, then the time studied across those seven days. Weeks are assigned to the quarter their first day falls in, so a week straddling the boundary is counted once. The highlighted cell is the week containing today; faint cells had no study time.':
    '每个格子是本季度的一个自然周 — 先是这一周的起始日期，然后是这七天的学习时间。每一周归入其第一天所在的季度，所以跨季度的周只会算一次。高亮的格子是包含今天的那一周；浅色格子表示没有学习时间。',
  'Previous quarter': '上一季度',
  'Next quarter': '下一季度',
  'No weeks fall inside {quarter}.': '{quarter}内没有任何一周。',
  'Week of {date}': '{date} 起的一周',
  'total': '合计',
  'over {n} weeks': '共 {n} 周',

  // ---- Insights: mood ----
  'One cell per day over {span} — the span follows the interval chosen at the top of the page ("{ival}").':
    '{span}内每天一个格子 — 跨度跟随页面顶部选择的区间（“{ival}”）。',
  "A day you rated draws that mood's face in its own colour; a day with no mood recorded stays an empty cell, and is never counted as an average day. Mood is set in the daily log under each day.":
    '你评过分的日子会用该心情自己的颜色画出对应的表情；没有记录心情的日子保持空格，也绝不会被当作平均水平的一天。心情在每天下方的每日记录里设置。',
  'no mood logged': '没有记录心情',
  'days rated': '天已评分',
  'avg mood': '平均心情',
  'most often': '最常见',
  'No moods logged in this range yet — tap a face in the daily log and the grid fills in.':
    '这个范围内还没有记录心情 — 在每日记录里点一个表情，网格就会填上。',

  // ---- Insights: sleep & weight ----
  // NOTE: the bare key 'Weight' is deliberately absent. It means 权重 in the
  // binder's grades table and 体重 in this card, and a flat English-keyed map
  // cannot hold both — so both sites fall back to English rather than one of
  // them reading wrong. See the handover note.
  'Sleep': '睡眠',
  'Body weight': '体重',
  'Sleep or weight': '睡眠或体重',
  'Hours slept the night into each day over {span} — the span follows the interval at the top of the page ("{ival}"), so a single day shows the last 30 nights instead of one dot.':
    '{span}内每天前一晚的睡眠时长 — 跨度跟随页面顶部的区间（“{ival}”），所以选择一天时会显示最近 30 晚，而不是一个点。',
  'Nights you did not log break the line and are left out of the average, rather than counting as zero. Always drawn in hours: the hrs/mins toggle applies to study durations only. Sleep is recorded in the daily log — this chart just reads it.':
    '没有记录的夜晚会让线断开，也不计入平均值，而不是当作 0。始终以小时显示：小时/分钟切换只作用于学习时长。睡眠在每日记录里填写 — 这张图只是读取它。',
  'Morning weight over {span}, from the scale field beside the sleep input in the daily log.':
    '{span}内的晨起体重，来自每日记录里睡眠输入旁的体重栏。',
  'The axis hugs your numbers a couple of kilos either side — against a zero axis the line would be flat, and the drift is what this chart is for. Unlogged days break the line and are left out of the average.':
    '坐标轴只在你的数值上下各留几公斤 — 若从 0 开始，这条线会是一条平线，而这张图要看的正是那点起伏。没有记录的日子会让线断开，也不计入平均值。',
  'Average night': '平均每晚',
  'over {n} logged {nights}': '共 {n} {nights}有记录',
  'night': '晚',
  'nights': '晚',
  'no nights logged yet': '还没有记录夜晚',
  'Shortest / longest': '最短 / 最长',
  'Average': '平均',
  'over {n} logged {days}': '共 {n} {days}有记录',
  'no weigh-ins logged yet': '还没有记录体重',
  'Lightest / heaviest': '最轻 / 最重',
  'No sleep logged in this range yet — add hours under ☾ in the daily log and the line appears here.':
    '这个范围内还没有睡眠记录 — 在每日记录的 ☾ 下填入小时数，线就会出现在这里。',
  'No weigh-ins in this range yet — add kilograms beside the ☾ sleep field in the daily log.':
    '这个范围内还没有体重记录 — 在每日记录里 ☾ 睡眠栏旁填入公斤数。',
  'Hours slept per night': '每晚睡眠小时数',
  'Weight per day': '每天体重',
  'avg': '平均',

  // ---- Insights: water ----
  'Water': '喝水',
  'Glasses of water crossed off in the daily log over {span} — the span follows the interval at the top of the page ("{ival}").':
    '{span}内在每日记录里划掉的水杯数 — 跨度跟随页面顶部的区间（“{ival}”）。',
  "Only days with a log entry count: a day you never opened leaves a gap and is left out of the average, while a logged day with no glasses is a real zero. Past year and All time show one bar per week, holding that week's average per logged day, so the eight-glass target line still reads the same way.":
    '只有有记录的日子才算：你从未打开过的日子会留一个空档，也不计入平均值，而记录了但一杯没喝的日子是真正的 0。过去一年和全部时间每周一根柱子，柱高是那一周每个已记录日的平均值，所以八杯的目标线读法不变。',
  'Average per day': '每天平均',
  'across {n} logged {days}': '共 {n} {days}有记录',
  'no days logged yet': '还没有记录任何一天',
  'Target hit': '达标次数',
  '{days} at {n} glasses': '达到 {n} 杯的{days}数',
  'glass': '杯',
  'glasses': '杯',
  'No water logged in this range yet — cross off a glass in the daily log and the bars appear here.':
    '这个范围内还没有喝水记录 — 在每日记录里划掉一杯，柱状图就会出现在这里。',
  'Glasses of water per week': '每周喝水杯数',
  'Glasses of water per day': '每天喝水杯数',
  'avg over {n} logged {days}': '共 {n} {days}记录的平均值',
  'target': '目标',
  'this week': '本周',

  // ---- Insights: journalling ----
  'One cell per day over {span} — the span follows the interval at the top of the page ("{ival}").':
    '{span}内每天一个格子 — 跨度跟随页面顶部的区间（“{ival}”）。',
  "The shade is how LONG that day's entry is in characters, not just whether you wrote one, so a run of one-liners still reads differently from a run of long entries. A day with other log data but no written entry takes the faintest shade; a day with nothing logged at all stays empty.":
    '深浅表示当天日记有多长（按字符数），而不只是有没有写，所以一串短句和一串长文看起来仍然不同。有其他记录但没写日记的日子取最浅的一档；完全没有记录的日子保持空白。',
  'character': '个字符',
  'characters': '个字符',
  'logged, no journal entry': '有记录，但没写日记',
  'nothing logged': '没有任何记录',
  // "12 of 30" — a bare separator, not the English word.
  'of': '/',
  'days journalled': '天写了日记',
  'avg characters': '平均字符数',
  'longest entry': '最长的一篇',
  'logged, no entry': '有记录，未写',
  'shorter': '较短',
  'longer': '较长',
  'Entries are written in the daily log at the bottom of each day.': '日记在每天底部的每日记录里书写。',
  'Nothing written in this range yet — the grid fills in as you journal.': '这个范围内还没有写过 — 你写日记后网格就会填上。',

  // ---- Insights: weather ----
  'Weather': '天气',
  'How often each kind of weather was marked over {span} — the span follows the interval at the top of the page ("{ival}").':
    '{span}内每种天气被标记的次数 — 跨度跟随页面顶部的区间（“{ival}”）。',
  'The daily log records one weather per day, so every marked day falls in exactly one row and the counts add up to the number of days marked. Days with no weather set are not counted at all.':
    '每日记录每天只记一种天气，所以每个标记过的日子只落在一行里，各行计数之和就是标记过的天数。没有设置天气的日子完全不计入。',
  "No weather marked in this range yet — pick a day's weather in the daily log to fill this in.":
    '这个范围内还没有标记天气 — 在每日记录里选一天的天气来填充这里。',
  '{days} marked of {n}': '{days}已标记，共 {n} 天',

  // ---- Shared date labels used by the insights charts ----
  'Tuesday': '星期二',
  'Wednesday': '星期三',
  'Thursday': '星期四',
  'Friday': '星期五',
  '{dow} {day} {mon}': '{mon}{day}日 {dow}',
  '{dow}, {mon} {day}': '{mon}{day}日 {dow}',
}
