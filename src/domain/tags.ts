import { SCENARIOS, type Scenario } from './schemas.js';

export { SCENARIOS };
export type { Scenario };

export const SCENARIO_GROUPS = [
  { id: 'work', label: '工作' },
  { id: 'study', label: '学习' },
  { id: 'cs-ai', label: '计算机科学与 AI' },
  { id: 'communication', label: '日常交流' },
  { id: 'life', label: '日常生活' },
  { id: 'culture-art', label: '文化艺术' },
  { id: 'games', label: '游戏' },
  { id: 'travel', label: '旅行' },
  { id: 'food', label: '美食' },
  { id: 'music', label: '音乐' },
  { id: 'daily-goods', label: '日用品' },
  { id: 'misc', label: '其他' },
] as const;
export type ScenarioGroupId = (typeof SCENARIO_GROUPS)[number]['id'];

export const SCENARIO_INFO: Record<
  string,
  { label: string; group: ScenarioGroupId; hint: string }
> = {
  'biz-email': { label: '商务邮件', group: 'work', hint: '客户/同事邮件、正式问询、附件请求' },
  meeting: { label: '会议讨论', group: 'work', hint: '会议表达、议题切换、结论复述' },
  interview: { label: '面试', group: 'work', hint: '自我介绍、行为面试、Q&A' },
  negotiation: { label: '谈判', group: 'work', hint: '议价、让步、达成共识' },
  'work-chat': { label: '工作沟通', group: 'work', hint: 'IM、任务同步、同事协作' },

  classroom: { label: '课堂学习', group: 'study', hint: '听课、提问、作业、课堂讨论' },
  exam: { label: '考试备考', group: 'study', hint: '考试、测验、复习、成绩' },
  'paper-writing': { label: '论文写作', group: 'study', hint: 'Abstract/Intro/讨论部分用语' },
  'academic-talk': { label: '学术演讲', group: 'study', hint: '报告、Q&A、引导话题' },
  reading: { label: '阅读文献', group: 'study', hint: '高频学术词、长句拆解' },

  coding: { label: '编程', group: 'cs-ai', hint: '代码评审、API 设计、调试讨论' },
  'ai-ml': { label: 'AI / ML', group: 'cs-ai', hint: '模型、训练、Prompt、Agent 表达' },
  devops: { label: 'DevOps', group: 'cs-ai', hint: 'CI/CD、部署、监控、告警' },
  data: { label: '数据', group: 'cs-ai', hint: 'SQL、报表、数据管线' },
  'system-design': { label: '系统设计', group: 'cs-ai', hint: '架构、扩展性、权衡' },

  'small-talk': { label: '寒暄闲聊', group: 'communication', hint: '问候、近况、轻松闲聊' },
  opinions: { label: '表达观点', group: 'communication', hint: '赞同、反对、评价、建议' },
  emotions: { label: '情绪表达', group: 'communication', hint: '开心、担心、安慰、抱怨' },
  'social-media': { label: '社交媒体', group: 'communication', hint: '帖子、评论、私信、网络表达' },
  idioms: { label: '习语俚语', group: 'communication', hint: 'idioms、slang、固定表达' },

  shopping: { label: '购物', group: 'life', hint: '试穿、退换、议价、问尺码' },
  doctor: { label: '看病', group: 'life', hint: '症状描述、挂号、药物' },
  rent: { label: '租房', group: 'life', hint: '看房、押金、合同条款' },
  transport: { label: '日常出行', group: 'life', hint: '打车、公交、地铁、通勤' },
  errands: { label: '办事跑腿', group: 'life', hint: '预约、排队、缴费、取件' },

  movies: { label: '影视', group: 'culture-art', hint: '电影、剧集、台词、剧情讨论' },
  books: { label: '书籍阅读', group: 'culture-art', hint: '小说、非虚构、读书讨论' },
  art: { label: '艺术展演', group: 'culture-art', hint: '展览、绘画、戏剧、博物馆' },
  festivals: { label: '节日习俗', group: 'culture-art', hint: '节日问候、习俗、活动' },
  memes: { label: '流行梗', group: 'culture-art', hint: '网络流行语、表情包梗' },

  'video-games': { label: '电子游戏', group: 'games', hint: '游戏机制、装备、关卡、队友沟通' },
  'board-games': { label: '桌游', group: 'games', hint: '规则、回合、策略、计分' },
  'game-chat': { label: '游戏交流', group: 'games', hint: '开黑、语音、战术、输赢反馈' },

  'airport-hotel': { label: '机场酒店', group: 'travel', hint: '值机、行李、入住、退房' },
  directions: { label: '问路导航', group: 'travel', hint: '问方向、距离、交通工具' },
  complaints: { label: '投诉求助', group: 'travel', hint: '丢东西、设施故障、求助' },
  sightseeing: { label: '观光游览', group: 'travel', hint: '景点、门票、行程、导览' },

  dining: { label: '餐厅点餐', group: 'food', hint: '菜单、忌口、加单、买单' },
  cooking: { label: '烹饪', group: 'food', hint: '食材、菜谱、火候、调味' },
  coffee: { label: '咖啡饮品', group: 'food', hint: '咖啡、茶饮、甜点、外带' },
  groceries: { label: '买菜食品', group: 'food', hint: '超市、食材、保质期、包装' },

  'music-listening': { label: '听歌聊歌', group: 'music', hint: '歌单、歌词、风格、演唱会' },
  'music-performance': { label: '音乐演出', group: 'music', hint: '排练、舞台、演奏、表演' },
  instruments: { label: '乐器', group: 'music', hint: '乐器、练习、调音、技巧' },

  'household-items': { label: '家居用品', group: 'daily-goods', hint: '家具、电器、清洁用品、收纳' },
  'personal-care': { label: '个人护理', group: 'daily-goods', hint: '洗护、护肤、药妆、日化' },
  clothing: { label: '衣物配饰', group: 'daily-goods', hint: '衣服、鞋包、尺码、材质' },

  workplace: { label: '职场（旧）', group: 'misc', hint: '历史数据兼容' },
  computing: { label: '计算机（旧）', group: 'misc', hint: '历史数据兼容' },
  ai: { label: 'AI（旧）', group: 'misc', hint: '历史数据兼容' },
  travel: { label: '旅游（旧）', group: 'misc', hint: '历史数据兼容' },
  daily: { label: '日常（旧）', group: 'misc', hint: '历史数据兼容' },
  food: { label: '美食（旧）', group: 'misc', hint: '历史数据兼容' },
  slack: { label: 'Slack 沟通（旧）', group: 'misc', hint: '历史数据兼容，优先使用 work-chat' },
};

export function scenariosByGroup(): Array<{
  group: ScenarioGroupId;
  groupLabel: string;
  items: Array<{ id: Scenario; label: string; hint: string }>;
}> {
  return SCENARIO_GROUPS.filter((g) => g.id !== 'misc').map((g) => ({
    group: g.id,
    groupLabel: g.label,
    items: Object.entries(SCENARIO_INFO)
      .filter(([, info]) => info.group === g.id)
      .map(([id, info]) => ({ id, label: info.label, hint: info.hint })),
  }));
}

export const SCENARIO_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(SCENARIO_INFO).map(([k, v]) => [k, v.label]),
);

export function scenarioLabel(scenario: string): string {
  return SCENARIO_LABELS[scenario] ?? scenario;
}

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

export const SCENARIO_KEYWORDS: Record<string, { en: string[]; cn: string[] }> = {
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
  'work-chat': {
    en: ['message', 'ping', 'thread', 'channel', 'update', 'deadline', 'task', 'sync', 'handoff', 'blocked'],
    cn: ['消息', '同步', '任务', '截止', '协作', '进展', '交接', '阻塞'],
  },
  classroom: {
    en: ['class', 'lesson', 'teacher', 'student', 'homework', 'assignment', 'lecture', 'question', 'explain'],
    cn: ['课堂', '上课', '老师', '学生', '作业', '讲解', '提问'],
  },
  exam: {
    en: ['exam', 'test', 'quiz', 'score', 'grade', 'review', 'practice', 'pass', 'fail'],
    cn: ['考试', '测验', '分数', '成绩', '复习', '练习', '及格'],
  },
  'paper-writing': {
    en: ['abstract', 'introduction', 'method', 'methodology', 'result', 'conclusion', 'reference', 'citation', 'hypothesis', 'experiment'],
    cn: ['摘要', '引言', '方法', '结果', '结论', '引用', '假设', '实验', '文献'],
  },
  'academic-talk': {
    en: ['lecture', 'seminar', 'conference', 'presentation', 'slide', 'audience', 'q and a'],
    cn: ['讲座', '研讨', '会议', '演讲', '幻灯片', '听众', '答疑'],
  },
  reading: {
    en: ['journal', 'paper', 'article', 'thesis', 'dissertation', 'literature', 'review', 'chapter'],
    cn: ['期刊', '论文', '文章', '文献', '综述', '章节', '阅读'],
  },
  coding: {
    en: ['code', 'function', 'variable', 'class', 'method', 'bug', 'debug', 'commit', 'merge', 'pull request', 'review', 'refactor', 'syntax', 'compile'],
    cn: ['代码', '函数', '变量', '类型', '方法', '调试', '提交', '合并', '重构', '编译', '编程', '程序'],
  },
  'ai-ml': {
    en: ['model', 'training', 'inference', 'neural', 'dataset', 'prompt', 'agent', 'embedding', 'token', 'fine-tune', 'gradient', 'loss'],
    cn: ['模型', '训练', '推理', '神经', '数据集', '提示词', '智能体', '微调', '梯度'],
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
  'small-talk': {
    en: ['hello', 'hi', 'morning', 'weekend', 'weather', 'how are you', 'catch up'],
    cn: ['你好', '早上好', '周末', '天气', '近况', '寒暄'],
  },
  opinions: {
    en: ['think', 'believe', 'agree', 'disagree', 'opinion', 'suggest', 'recommend', 'prefer'],
    cn: ['认为', '同意', '反对', '观点', '建议', '推荐', '偏好'],
  },
  emotions: {
    en: ['happy', 'sad', 'angry', 'worried', 'nervous', 'excited', 'sorry', 'relieved'],
    cn: ['开心', '难过', '生气', '担心', '紧张', '兴奋', '抱歉', '放心'],
  },
  'social-media': {
    en: ['post', 'comment', 'share', 'like', 'follow', 'message', 'profile', 'viral'],
    cn: ['帖子', '评论', '分享', '点赞', '关注', '私信', '主页', '热门'],
  },
  idioms: {
    en: ['idiom', 'slang', 'phrase', 'expression'],
    cn: ['谚语', '俚语', '习语', '俗语', '固定表达'],
  },
  shopping: {
    en: ['buy', 'shop', 'store', 'price', 'sale', 'discount', 'refund', 'return', 'cashier', 'receipt', 'try on', 'size', 'fit'],
    cn: ['购物', '购买', '商店', '价格', '打折', '退款', '试穿', '尺码', '收银'],
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
    en: ['taxi', 'cab', 'uber', 'subway', 'bus', 'train', 'station', 'fare', 'ticket', 'transfer', 'route', 'commute'],
    cn: ['出租车', '打车', '地铁', '公交', '火车', '车站', '票价', '换乘', '路线', '通勤'],
  },
  errands: {
    en: ['appointment', 'queue', 'line', 'pickup', 'deliver', 'document', 'counter', 'office', 'fee'],
    cn: ['预约', '排队', '取件', '寄送', '材料', '柜台', '缴费', '办事'],
  },
  movies: {
    en: ['movie', 'film', 'cinema', 'scene', 'director', 'actor', 'actress', 'plot', 'subtitle'],
    cn: ['电影', '影院', '导演', '演员', '剧情', '字幕', '台词'],
  },
  books: {
    en: ['book', 'novel', 'author', 'chapter', 'plot', 'character', 'fiction', 'nonfiction'],
    cn: ['书籍', '小说', '作者', '章节', '情节', '角色', '读书'],
  },
  art: {
    en: ['art', 'museum', 'gallery', 'painting', 'exhibition', 'theater', 'performance'],
    cn: ['艺术', '博物馆', '画廊', '绘画', '展览', '戏剧', '表演'],
  },
  festivals: {
    en: ['christmas', 'thanksgiving', 'halloween', 'easter', 'new year', 'festival', 'celebration', 'tradition'],
    cn: ['节日', '春节', '圣诞', '感恩', '万圣', '庆祝', '传统'],
  },
  memes: {
    en: ['meme', 'viral', 'trending', 'lol', 'lmao', 'tbh', 'fyi', 'omg'],
    cn: ['热门', '热梗', '流行语', '表情包'],
  },
  'video-games': {
    en: ['game', 'level', 'quest', 'player', 'team', 'rank', 'loot', 'skill', 'boss', 'controller'],
    cn: ['游戏', '关卡', '任务', '玩家', '队伍', '排位', '装备', '技能', '手柄'],
  },
  'board-games': {
    en: ['board game', 'dice', 'card', 'turn', 'rule', 'score', 'strategy', 'piece'],
    cn: ['桌游', '骰子', '卡牌', '回合', '规则', '计分', '策略', '棋子'],
  },
  'game-chat': {
    en: ['gg', 'team up', 'voice chat', 'carry', 'heal', 'push', 'defend', 'attack'],
    cn: ['开黑', '语音', '队友', '带飞', '治疗', '推进', '防守', '进攻'],
  },
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
  sightseeing: {
    en: ['sightseeing', 'tour', 'ticket', 'museum', 'landmark', 'guide', 'itinerary', 'view'],
    cn: ['观光', '旅游', '门票', '景点', '地标', '导游', '行程', '风景'],
  },
  dining: {
    en: ['menu', 'order', 'waiter', 'waitress', 'reservation', 'bill', 'tip', 'spicy', 'allergic', 'vegetarian', 'takeout', 'delivery'],
    cn: ['菜单', '点餐', '服务员', '预订', '账单', '小费', '辛辣', '过敏', '素食', '外卖'],
  },
  cooking: {
    en: ['cook', 'recipe', 'ingredient', 'seasoning', 'boil', 'fry', 'bake', 'slice', 'chop'],
    cn: ['烹饪', '菜谱', '食材', '调料', '煮', '炒', '烘焙', '切片'],
  },
  coffee: {
    en: ['coffee', 'latte', 'espresso', 'tea', 'drink', 'to go', 'decaf', 'syrup'],
    cn: ['咖啡', '拿铁', '浓缩', '茶饮', '饮料', '外带', '糖浆'],
  },
  groceries: {
    en: ['grocery', 'supermarket', 'vegetable', 'fruit', 'meat', 'milk', 'package', 'expire'],
    cn: ['超市', '蔬菜', '水果', '肉类', '牛奶', '包装', '保质期'],
  },
  'music-listening': {
    en: ['music', 'song', 'playlist', 'album', 'lyrics', 'concert', 'band', 'genre'],
    cn: ['音乐', '歌曲', '歌单', '专辑', '歌词', '演唱会', '乐队', '风格'],
  },
  'music-performance': {
    en: ['rehearsal', 'stage', 'perform', 'concert', 'microphone', 'audience', 'soundcheck'],
    cn: ['排练', '舞台', '表演', '演出', '麦克风', '观众', '试音'],
  },
  instruments: {
    en: ['guitar', 'piano', 'violin', 'drum', 'instrument', 'tune', 'chord', 'practice'],
    cn: ['吉他', '钢琴', '小提琴', '鼓', '乐器', '调音', '和弦', '练习'],
  },
  'household-items': {
    en: ['furniture', 'sofa', 'table', 'chair', 'lamp', 'cleaner', 'storage', 'appliance'],
    cn: ['家具', '沙发', '桌子', '椅子', '台灯', '清洁', '收纳', '电器'],
  },
  'personal-care': {
    en: ['shampoo', 'soap', 'toothbrush', 'skincare', 'lotion', 'razor', 'towel'],
    cn: ['洗发水', '肥皂', '牙刷', '护肤', '乳液', '剃须刀', '毛巾'],
  },
  clothing: {
    en: ['shirt', 'pants', 'shoes', 'jacket', 'dress', 'size', 'fabric', 'cotton'],
    cn: ['衬衫', '裤子', '鞋子', '夹克', '裙子', '尺码', '面料', '棉'],
  },
  workplace: { en: [], cn: [] },
  computing: { en: [], cn: [] },
  ai: { en: [], cn: [] },
  travel: { en: [], cn: [] },
  daily: { en: [], cn: [] },
  food: { en: [], cn: [] },
  slack: { en: [], cn: [] },
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesEnWord(text: string, kw: string): boolean {
  if (/\s/.test(kw)) return text.includes(kw);
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(kw)}($|[^a-z0-9])`, 'i');
  return re.test(text);
}

export function classifyScenarios(en?: string, cn?: string): Scenario[] {
  const hits: Scenario[] = [];
  const enLower = en?.toLowerCase() ?? '';
  const cnNorm = cn ?? '';
  for (const [scenario, kws] of Object.entries(SCENARIO_KEYWORDS)) {
    if (SCENARIO_INFO[scenario]?.group === 'misc') continue;
    let hit = false;
    if (enLower && kws.en.some((kw) => matchesEnWord(enLower, kw))) hit = true;
    if (!hit && cnNorm && kws.cn.some((kw) => cnNorm.includes(kw))) hit = true;
    if (hit) hits.push(scenario);
  }
  return hits;
}
