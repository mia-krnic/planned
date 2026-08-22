/**
 * The Home page's words in Chinese.
 *
 * Not a translation of quotes.ts. The English pools are Thoreau and Marcus
 * Aurelius; asking for those in Chinese would produce a translated Westerner,
 * which is not what a Chinese reader wants under the clock. These are the lines
 * a Chinese student already half-knows — 《论语》, 老子, 苏轼, 《周易》 — in their
 * original wording, so the pair of pools are siblings rather than copies.
 *
 * Two flat lists rather than quotes.ts' QUOTE_PAIRS: nothing here was written
 * beside anything else, and the page draws the short line and the long line
 * independently anyway (see homePicks).
 *
 * Every entry is a real, sourced line. Where the received text and a common
 * misquote differ (是人 / 斯人), the received text wins. Nothing is attributed on
 * a guess — a line with no reliable author simply carries none.
 *
 * Append-only, like quotes.ts: no index into either list survives a load.
 */
import type { Quote } from './quotes'

/** The long line along the bottom of the page. */
export const QUOTES_ZH: Quote[] = [
  { text: '学而时习之，不亦说乎', author: '《论语·学而》' },
  { text: '三人行，必有我师焉', author: '《论语·述而》' },
  { text: '学而不思则罔，思而不学则殆', author: '《论语·为政》' },
  { text: '知之为知之，不知为不知，是知也', author: '《论语·为政》' },
  { text: '知之者不如好之者，好之者不如乐之者', author: '《论语·雍也》' },
  { text: '逝者如斯夫，不舍昼夜', author: '《论语·子罕》' },
  { text: '岁寒，然后知松柏之后凋也', author: '《论语·子罕》' },
  { text: '工欲善其事，必先利其器', author: '《论语·卫灵公》' },
  { text: '己所不欲，勿施于人', author: '《论语·卫灵公》' },
  { text: '君子坦荡荡，小人长戚戚', author: '《论语·述而》' },
  { text: '士不可以不弘毅，任重而道远', author: '曾子《论语·泰伯》' },
  { text: '千里之行，始于足下', author: '老子《道德经》' },
  { text: '合抱之木，生于毫末；九层之台，起于累土', author: '老子《道德经》' },
  { text: '上善若水，水善利万物而不争', author: '老子《道德经》' },
  { text: '知人者智，自知者明', author: '老子《道德经》' },
  { text: '天下难事，必作于易；天下大事，必作于细', author: '老子《道德经》' },
  { text: '祸兮福之所倚，福兮祸之所伏', author: '老子《道德经》' },
  { text: '大方无隅，大器晚成，大音希声', author: '老子《道德经》' },
  { text: '吾生也有涯，而知也无涯', author: '《庄子·养生主》' },
  { text: '天地与我并生，而万物与我为一', author: '《庄子·齐物论》' },
  { text: '井蛙不可以语于海者，拘于虚也', author: '《庄子·秋水》' },
  { text: '天将降大任于是人也，必先苦其心志，劳其筋骨', author: '《孟子·告子下》' },
  { text: '穷则独善其身，达则兼善天下', author: '《孟子·尽心上》' },
  { text: '富贵不能淫，贫贱不能移，威武不能屈', author: '《孟子·滕文公下》' },
  { text: '尽信书，则不如无书', author: '《孟子·尽心下》' },
  { text: '不积跬步，无以至千里；不积小流，无以成江海', author: '《荀子·劝学》' },
  { text: '锲而舍之，朽木不折；锲而不舍，金石可镂', author: '《荀子·劝学》' },
  { text: '青，取之于蓝，而青于蓝', author: '《荀子·劝学》' },
  { text: '路漫漫其修远兮，吾将上下而求索', author: '屈原《离骚》' },
  { text: '长风破浪会有时，直挂云帆济沧海', author: '李白《行路难》' },
  { text: '天生我材必有用，千金散尽还复来', author: '李白《将进酒》' },
  { text: '会当凌绝顶，一览众山小', author: '杜甫《望岳》' },
  { text: '读书破万卷，下笔如有神', author: '杜甫《奉赠韦左丞丈二十二韵》' },
  { text: '好雨知时节，当春乃发生', author: '杜甫《春夜喜雨》' },
  { text: '人有悲欢离合，月有阴晴圆缺，此事古难全', author: '苏轼《水调歌头》' },
  { text: '竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生', author: '苏轼《定风波》' },
  { text: '不识庐山真面目，只缘身在此山中', author: '苏轼《题西林壁》' },
  { text: '知是行之始，行是知之成', author: '王阳明《传习录》' },
  { text: '破山中贼易，破心中贼难', author: '王阳明《与杨仕德薛尚谦书》' },
  { text: '问渠那得清如许？为有源头活水来', author: '朱熹《观书有感》' },
  { text: '非淡泊无以明志，非宁静无以致远', author: '诸葛亮《诫子书》' },
  { text: '夫学须静也，才须学也', author: '诸葛亮《诫子书》' },
  { text: '人固有一死，或重于泰山，或轻于鸿毛', author: '司马迁《报任安书》' },
  { text: '桃李不言，下自成蹊', author: '司马迁《史记·李将军列传》' },
  { text: '天行健，君子以自强不息', author: '《周易·乾卦》' },
  { text: '地势坤，君子以厚德载物', author: '《周易·坤卦》' },
  { text: '穷则变，变则通，通则久', author: '《周易·系辞下》' },
  { text: '如切如磋，如琢如磨', author: '《诗经·卫风·淇奥》' },
  { text: '靡不有初，鲜克有终', author: '《诗经·大雅·荡》' },
  { text: '高山仰止，景行行止', author: '《诗经·小雅·车舝》' },
  { text: '盛年不重来，一日难再晨。及时当勉励，岁月不待人', author: '陶渊明《杂诗》' },
  { text: '纸上得来终觉浅，绝知此事要躬行', author: '陆游《冬夜读书示子聿》' },
  { text: '山重水复疑无路，柳暗花明又一村', author: '陆游《游山西村》' },
  { text: '不畏浮云遮望眼，只缘身在最高层', author: '王安石《登飞来峰》' },
  { text: '千磨万击还坚劲，任尔东西南北风', author: '郑燮《竹石》' },
  { text: '沉舟侧畔千帆过，病树前头万木春', author: '刘禹锡《酬乐天扬州初逢席上见赠》' },
  { text: '海内存知己，天涯若比邻', author: '王勃《送杜少府之任蜀州》' },
  { text: '野火烧不尽，春风吹又生', author: '白居易《赋得古原草送别》' },
  { text: '生当作人杰，死亦为鬼雄', author: '李清照《夏日绝句》' },
  { text: '行到水穷处，坐看云起时', author: '王维《终南别业》' },
  { text: '博学之，审问之，慎思之，明辨之，笃行之', author: '《礼记·中庸》' },
  { text: '苟日新，日日新，又日新', author: '《礼记·大学》' },
  { text: '业精于勤，荒于嬉；行成于思，毁于随', author: '韩愈《进学解》' },
  { text: '老骥伏枥，志在千里', author: '曹操《龟虽寿》' },
  { text: '人生自古谁无死，留取丹心照汗青', author: '文天祥《过零丁洋》' },
  { text: '莫等闲，白了少年头，空悲切', author: '岳飞《满江红》' },
  { text: '临渊羡鱼，不如退而结网', author: '《淮南子·说林训》' },
  { text: '千里之堤，溃于蚁穴', author: '《韩非子·喻老》' },
  { text: '民生在勤，勤则不匮', author: '《左传·宣公十二年》' },
  { text: '宠辱不惊，闲看庭前花开花落', author: '洪应明《菜根谭》' },
]

/**
 * The short line under the clock. Half classical fragments the language already
 * carries around — 日拱一卒, 静水流深 — and half the app's own plain voice, the
 * register a friend uses. No exclamation marks: the English pool has none
 * either, and 加油-style cheerleading is exactly the tone the page avoids.
 */
export const MANTRAS_ZH: string[] = [
  '呼吸。开始。',
  '慢慢来，比较快。',
  '不积跬步，无以至千里。',
  '一步一步来。',
  '活在当下。',
  '从头再来。',
  '心静自然凉。',
  '水到渠成。',
  '日拱一卒。',
  '温故知新。',
  '厚积薄发。',
  '事在人为。',
  '静水流深。',
  '循序渐进。',
  '持之以恒。',
  '行胜于言。',
  '知行合一。',
  '大道至简。',
  '顺其自然。',
  '张弛有度。',
  '守拙求进。',
  '天道酬勤。',
  '柳暗花明。',
  '苦尽甘来。',
  '学不可以已。',
  '尽人事，听天命。',
  '先做，再说。',
  '今日事，今日毕。',
  '一次只做一件事。',
  '把手边这件做好。',
  '从最小的一步开始。',
  '完成比完美重要。',
  '与其焦虑，不如动手。',
  '少即是多。',
  '休息也是功课。',
  '累了就停一停。',
  '起身，走一走。',
  '喝口水。',
  '抬头看看天。',
  '早点睡，明天见。',
  '别急，天没塌。',
  '善待自己。',
  '允许自己慢一点。',
  '你已经做得够多了。',
  '好好吃饭，好好睡觉。',
  '静下来，再出发。',
  '心宽路自宽。',
  '今天也算数。',
]
