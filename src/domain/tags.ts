import { SCENARIOS, type Scenario } from './schemas.js';

export { SCENARIOS };
export type { Scenario };

// 一级大类
export const SCENARIO_GROUPS = [
  { id: 'work', label: '工作' },
  { id: 'tech', label: '技术' },
  { id: 'life', label: '生活' },
  { id: 'culture', label: '文化' },
  { id: 'academic', label: '学术' },
  { id: 'travel', label: '旅行' },
  { id: 'misc', label: '其他' }, // 收纳老的宽泛场景
] as const;
export type ScenarioGroupId = (typeof SCENARIO_GROUPS)[number]['id'];

// 二级细分（scenario → label + 所属大类 + 简短说明）
export const SCENARIO_INFO: Record<
  Scenario,
  { label: string; group: ScenarioGroupId; hint: string }
> = {
  // 工作
  'biz-email': { label: '商务邮件', group: 'work', hint: '客户/同事邮件、正式问询、附件请求' },
  meeting: { label: '会议讨论', group: 'work', hint: '会议表达、议题切换、结论复述' },
  interview: { label: '面试', group: 'work', hint: '自我介绍、行为面试、Q&A' },
  negotiation: { label: '谈判', group: 'work', hint: '议价、让步、达成共识' },
  slack: { label: 'Slack 沟通', group: 'work', hint: '非正式 IM、emoji、缩写' },
  // 技术
  coding: { label: '编程', group: 'tech', hint: '代码评审、API 设计、调试讨论' },
  'ai-ml': { label: 'AI / ML', group: 'tech', hint: '模型/训练/Prompt/Agent 表达' },
  devops: { label: 'DevOps', group: 'tech', hint: 'CI/CD、部署、监控、告警' },
  data: { label: '数据', group: 'tech', hint: 'SQL / 报表 / 数据管线' },
  'system-design': { label: '系统设计', group: 'tech', hint: '架构、扩展性、权衡' },
  // 生活
  shopping: { label: '购物', group: 'life', hint: '试穿、退换、议价、问尺码' },
  dining: { label: '点餐', group: 'life', hint: '菜单、忌口、加单、买单' },
  doctor: { label: '看病', group: 'life', hint: '症状描述、挂号、药物' },
  rent: { label: '租房', group: 'life', hint: '看房、押金、合同条款' },
  transport: { label: '出行', group: 'life', hint: '打车、公交、地铁、问路' },
  // 文化
  movies: { label: '影视台词', group: 'culture', hint: '电影/剧集中的常用表达' },
  idioms: { label: '习语俚语', group: 'culture', hint: 'idioms / slang / 固定表达' },
  festivals: { label: '节日', group: 'culture', hint: '节日问候、习俗、活动' },
  memes: { label: '流行梗', group: 'culture', hint: '网络流行语、表情包梗' },
  // 学术
  'paper-writing': { label: '论文写作', group: 'academic', hint: 'Abstract/Intro/讨论部分用语' },
  'academic-talk': { label: '学术演讲', group: 'academic', hint: '报告、Q&A、引导话题' },
  reading: { label: '文献阅读', group: 'academic', hint: '高频学术词、长句拆解' },
  // 旅行
  'airport-hotel': { label: '机场酒店', group: 'travel', hint: '值机、行李、入住、退房' },
  directions: { label: '问路', group: 'travel', hint: '问方向、距离、交通工具' },
  complaints: { label: '投诉求助', group: 'travel', hint: '丢东西、设施故障、求助' },
  // 兼容老值 —— 不再前端展示，仅用于历史数据兼容
  workplace: { label: '职场（旧）', group: 'misc', hint: '历史数据兼容' },
  computing: { label: '计算机（旧）', group: 'misc', hint: '历史数据兼容' },
  ai: { label: 'AI（旧）', group: 'misc', hint: '历史数据兼容' },
  travel: { label: '旅游（旧）', group: 'misc', hint: '历史数据兼容' },
  daily: { label: '日常交流（旧）', group: 'misc', hint: '历史数据兼容' },
  food: { label: '美食（旧）', group: 'misc', hint: '历史数据兼容' },
};

// 前端展示用：按大类分组的可选场景（不含 misc 老兼容值）
export function scenariosByGroup(): Array<{
  group: ScenarioGroupId;
  groupLabel: string;
  items: Array<{ id: Scenario; label: string; hint: string }>;
}> {
  return SCENARIO_GROUPS.filter((g) => g.id !== 'misc').map((g) => ({
    group: g.id,
    groupLabel: g.label,
    items: (Object.entries(SCENARIO_INFO) as Array<[Scenario, typeof SCENARIO_INFO[Scenario]]>)
      .filter(([, info]) => info.group === g.id)
      .map(([id, info]) => ({ id, label: info.label, hint: info.hint })),
  }));
}

// 旧名 SCENARIO_LABELS 仍被 generator prompt 使用
export const SCENARIO_LABELS: Record<Scenario, string> = Object.fromEntries(
  (Object.entries(SCENARIO_INFO) as Array<[Scenario, typeof SCENARIO_INFO[Scenario]]>).map(
    ([k, v]) => [k, v.label],
  ),
) as Record<Scenario, string>;

// 语言学标签：自由词表，仅作建议，AI 可扩展
export const SUGGESTED_LANG_TAGS = [
  'idiom',
  'phrasal-verb',
  'collocation',
  'preposition',
  'tense',
  'word',
  'phrase',
  'sentence',
  'formal',
  'informal',
] as const;

// ============================================================
// 场景关键词表 —— 用于 ingest 时给词条/句子打场景标签（0 token）
// 关键词命中即归类。一个 entry 可以同时属于多个场景。
// 字典义项 sense 的中文释义 + 例句 + 句子原文都参与匹配。
// ============================================================
export const SCENARIO_KEYWORDS: Record<Scenario, { en: string[]; cn: string[] }> = {
  // 工作
  'biz-email': {
    en: ['email', 'attach', 'cc', 'bcc', 'subject', 'regards', 'sincerely', 'inquiry', 'reply', 'forward', 'invoice', 'quotation', 'proposal'],
    cn: ['邮件', '附件', '抄送', '回复', '转发', '询问', '报价', '提案'],
  },
  meeting: {
    en: ['meeting', 'agenda', 'minutes', 'attend', 'present', 'discuss', 'conclusion', 'action item', 'schedule'],
    cn: ['会议', '议程', '纪要', '出席', '讨论', '结论', '议题'],
  },
  interview: {
    en: ['interview', 'candidate', 'resume', 'cv', 'experience', 'skill', 'offer', 'hire', 'recruit', 'salary expectation'],
    cn: ['面试', '简历', '候选人', '应聘', '招聘', '录用', '期望薪资'],
  },
  negotiation: {
    en: ['negotiate', 'bargain', 'concession', 'deal', 'agreement', 'compromise', 'counter-offer', 'discount'],
    cn: ['谈判', '议价', '让步', '协议', '折中', '还价', '折扣'],
  },
  slack: {
    en: ['slack', 'channel', 'dm', 'ping', 'thread', 'emoji', 'huddle'],
    cn: ['即时', '消息', '群聊', '私聊'],
  },
  // 技术
  coding: {
    en: ['code', 'function', 'variable', 'class', 'method', 'bug', 'debug', 'commit', 'merge', 'pull request', 'review', 'refactor', 'syntax', 'compile'],
    cn: ['代码', '函数', '变量', '类型', '方法', '调试', '提交', '合并', '重构', '编译', '编程', '程序'],
  },
  'ai-ml': {
    en: ['model', 'training', 'inference', 'neural', 'dataset', 'prompt', 'agent', 'embedding', 'token', 'fine-tune', 'gradient', 'loss'],
    cn: ['模型', '训练', '推理', '神经', '数据集', '提示词', '微调', '梯度'],
  },
  devops: {
    en: ['deploy', 'deployment', 'pipeline', 'ci', 'cd', 'rollback', 'kubernetes', 'docker', 'container', 'monitor', 'alert', 'incident', 'sla'],
    cn: ['部署', '流水线', '回滚', '容器', '监控', '告警', '事故'],
  },
  data: {
    en: ['sql', 'query', 'database', 'table', 'index', 'join', 'aggregate', 'pipeline', 'etl', 'dashboard', 'report', 'metric'],
    cn: ['数据库', '查询', '表格', '聚合', '指标', '报表', '数据'],
  },
  'system-design': {
    en: ['architecture', 'scalability', 'load balancer', 'cache', 'queue', 'microservice', 'latency', 'throughput', 'consistency', 'partition'],
    cn: ['架构', '扩展性', '负载均衡', '缓存', '队列', '微服务', '延迟', '吞吐'],
  },
  // 生活
  shopping: {
    en: ['buy', 'shop', 'store', 'price', 'sale', 'discount', 'refund', 'return', 'cashier', 'receipt', 'try on', 'size', 'fit'],
    cn: ['购物', '购买', '商店', '价格', '打折', '退款', '试穿', '尺码', '收银'],
  },
  dining: {
    en: ['menu', 'order', 'waiter', 'waitress', 'reservation', 'bill', 'tip', 'spicy', 'allergic', 'vegetarian', 'takeout', 'delivery'],
    cn: ['菜单', '点餐', '服务员', '预订', '账单', '小费', '辛辣', '过敏', '素食', '外卖'],
  },
  doctor: {
    en: ['doctor', 'patient', 'symptom', 'pain', 'fever', 'cough', 'prescription', 'medicine', 'hospital', 'clinic', 'appointment', 'diagnosis'],
    cn: ['医生', '病人', '症状', '疼痛', '发烧', '咳嗽', '处方', '药物', '医院', '诊所', '挂号', '诊断'],
  },
  rent: {
    en: ['rent', 'landlord', 'tenant', 'lease', 'deposit', 'apartment', 'utility', 'sublet', 'roommate'],
    cn: ['租房', '房东', '租客', '租约', '押金', '公寓', '水电', '转租', '室友'],
  },
  transport: {
    en: ['taxi', 'cab', 'uber', 'subway', 'bus', 'train', 'station', 'fare', 'ticket', 'transfer', 'route'],
    cn: ['出租车', '打车', '地铁', '公交', '火车', '车站', '票价', '换乘', '路线'],
  },
  // 文化
  movies: {
    en: ['movie', 'film', 'cinema', 'scene', 'director', 'actor', 'actress', 'plot', 'subtitle'],
    cn: ['电影', '影院', '导演', '演员', '剧情', '字幕', '台词'],
  },
  idioms: {
    en: [], // idioms 难用关键词识别，靠 ECDICT 的 tag 或长度+常用词组合
    cn: ['谚语', '俚语', '习语', '俗语'],
  },
  festivals: {
    en: ['christmas', 'thanksgiving', 'halloween', 'easter', 'new year', 'festival', 'celebration', 'tradition'],
    cn: ['节日', '春节', '圣诞', '感恩', '万圣', '庆祝', '传统'],
  },
  memes: {
    en: ['meme', 'viral', 'trending', 'lol', 'lmao', 'tbh', 'fyi', 'omg'],
    cn: ['热门', '热梗', '流行语'],
  },
  // 学术
  'paper-writing': {
    en: ['abstract', 'introduction', 'method', 'methodology', 'result', 'conclusion', 'reference', 'citation', 'hypothesis', 'experiment'],
    cn: ['摘要', '引言', '方法', '结果', '结论', '引用', '假设', '实验', '文献'],
  },
  'academic-talk': {
    en: ['lecture', 'seminar', 'conference', 'presentation', 'slide', 'audience', 'q and a'],
    cn: ['讲座', '研讨', '会议', '演讲', '幻灯片', '听众', '答疑'],
  },
  reading: {
    en: ['journal', 'paper', 'article', 'thesis', 'dissertation', 'literature', 'review'],
    cn: ['期刊', '论文', '文章', '文献', '综述'],
  },
  // 旅行
  'airport-hotel': {
    en: ['airport', 'flight', 'boarding', 'check-in', 'baggage', 'luggage', 'hotel', 'reservation', 'room', 'lobby', 'concierge'],
    cn: ['机场', '航班', '登机', '值机', '行李', '酒店', '预订', '房间', '大堂', '前台'],
  },
  directions: {
    en: ['direction', 'map', 'left', 'right', 'straight', 'block', 'corner', 'intersection', 'avenue', 'street', 'nearby'],
    cn: ['方向', '地图', '左转', '右转', '直走', '路口', '街道', '附近'],
  },
  complaints: {
    en: ['complaint', 'lost', 'stolen', 'broken', 'damaged', 'refund', 'help', 'emergency'],
    cn: ['投诉', '丢失', '被偷', '损坏', '退款', '求助', '紧急'],
  },
  // 兼容老值
  workplace: { en: [], cn: [] },
  computing: { en: [], cn: [] },
  ai: { en: [], cn: [] },
  travel: { en: [], cn: [] },
  daily: { en: [], cn: [] },
  food: { en: [], cn: [] },
};

/**
 * 用关键词匹配给文本打场景标签。
 * - 英文关键词：用 word boundary 严格匹配（避免 "ci" 误命中 "acid"）
 * - 中文关键词：substring 匹配（最小 2 字符已在词表层面保证）
 * 任何（en 关键词命中 en 文本） 或 （cn 关键词命中 cn 文本） → 命中该场景。
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function matchesEnWord(text: string, kw: string): boolean {
  // 含空格的多词关键词用普通 substring
  if (/\s/.test(kw)) return text.includes(kw);
  // 单词用 word boundary（仅匹配前后非字母数字的位置）
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(kw)}($|[^a-z0-9])`, 'i');
  return re.test(text);
}

export function classifyScenarios(en?: string, cn?: string): Scenario[] {
  const hits: Scenario[] = [];
  const enLower = en?.toLowerCase() ?? '';
  const cnNorm = cn ?? '';
  for (const [scenario, kws] of Object.entries(SCENARIO_KEYWORDS) as Array<[Scenario, { en: string[]; cn: string[] }]>) {
    if (SCENARIO_INFO[scenario].group === 'misc') continue;
    let hit = false;
    if (enLower && kws.en.some((kw) => matchesEnWord(enLower, kw))) hit = true;
    if (!hit && cnNorm && kws.cn.some((kw) => cnNorm.includes(kw))) hit = true;
    if (hit) hits.push(scenario);
  }
  return hits;
}
