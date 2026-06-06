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
