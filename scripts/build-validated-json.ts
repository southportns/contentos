#!/usr/bin/env node
/**
 * Build the complete VALIDATED_KNOWLEDGE_UNITS.json from scratch.
 * This script generates the final validated JSON with all fixes applied.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const ORIGINAL_PATH = path.join(ROOT, 'docs', 'p0.2.2', 'KNOWLEDGE_UNITS.json');
const OUTPUT_PATH = path.join(
  ROOT,
  'docs',
  'p0.2.2.1',
  'VALIDATED_KNOWLEDGE_UNITS.json',
);

interface Evidence {
  evidence_id: string;
  content_id: string;
  quote: string;
  location: string;
  validation: 'valid' | 'weak' | 'invalid';
  evidence_quality: 'high' | 'medium' | 'low';
  noise_risk: 'low' | 'medium' | 'high';
  evidence_trust: 'trusted' | 'caution' | 'excluded';
  note?: string;
}

interface KnowledgeUnit {
  knowledge_id: string;
  category: string;
  knowledge_level: string;
  name: string;
  description: string;
  abstract_pattern: string;
  function: string;
  evidence: {
    items: Evidence[];
    unique_content_count: number;
  };
  confidence: string;
  status: 'validated' | 'candidate';
  reclassified: boolean;
  note?: string;
  human_expression_verdict?: 'confirmed' | 'unconfirmed' | 'suspect';
  principle?: string;
  surface_forms?: string[];
}

function trust(e: Evidence): Evidence['evidence_trust'] {
  if (e.validation === 'invalid' || e.noise_risk === 'high') return 'excluded';
  if (e.validation === 'weak' || e.noise_risk === 'medium' || e.evidence_quality === 'low') return 'caution';
  return 'trusted';
}

function makeEvidence(
  id: string,
  contentId: string,
  quote: string,
  location: string,
  validation: Evidence['validation'],
  quality: Evidence['evidence_quality'],
  noise: Evidence['noise_risk'],
  note?: string,
): Evidence {
  const e: Evidence = {
    evidence_id: id,
    content_id: contentId,
    quote,
    location,
    validation,
    evidence_quality: quality,
    noise_risk: noise,
    evidence_trust: 'trusted',
  };
  e.evidence_trust = trust(e);
  if (note) e.note = note;
  return e;
}

function makeKU(
  id: string,
  category: string,
  level: string,
  name: string,
  description: string,
  abstractPattern: string,
  fn: string,
  items: Evidence[],
  confidence: string,
  status: 'validated' | 'candidate',
  reclassified: boolean,
  extra?: Partial<KnowledgeUnit>,
): KnowledgeUnit {
  return {
    knowledge_id: id,
    category,
    knowledge_level: level,
    name,
    description,
    abstract_pattern: abstractPattern,
    function: fn,
    evidence: { items, unique_content_count: new Set(items.map((e) => e.content_id)).size },
    confidence,
    status,
    reclassified,
    ...extra,
  };
}

const kus: KnowledgeUnit[] = [
  makeKU('KU_001', 'hook', 'structural_pattern', 'Question-based Conversational Hook',
    '通过直接向观众提问建立即时对话感，制造参与感和身份共鸣',
    'Question → Shared Experience → Curiosity',
    '建立注意力和身份共鸣，让观众感觉\'这是在说我\'',
    [
      makeEvidence('EV_001_01', 'cmtifxn9r0001gsrtxnkvbmzf', '你们有没有发现有一些关系你一开始很期待，但是后来却是越相处越累', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_001_02', 'cmtihp48w0000ygrtsrf1p1xr', '但是你有没有仔细想过，为什么是女孩子长脑子最快的方式呢？是因为女孩子不长脑子吗？', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_001_03', 'cmtjdo1ni0002h0rtgoifw23p', '先问你个问题，你是愿意花2万块钱去动个双眼皮，还是愿意花一个月工资去搞懂这个社会的底层运行规则？', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_001_04', 'cmtjdlzuo0001h0rtll7p5uax', '你有没有发现那些就是随手一穿就很好看的人，他们不知道背地里面试了多少搓？', 'opening', 'valid', 'high', 'low'),
    ],
    'medium', 'validated', false,
  ),

  makeKU('KU_002', 'hook', 'structural_pattern', 'Controversial Assertion Hook',
    '用争议性或反直觉的观点开场，立即制造认知冲突，激发观看欲望',
    'Controversial Statement → Identity Challenge → Curiosity',
    '通过挑战观众固有认知，制造\'我想看看她到底想说什么\'的好奇心',
    [
      makeEvidence('EV_002_01', 'cmtig0aoa0002gsrtbh7hywcp', '说一个很多女生不愿意承认的社会现状，就是现在我们国内女性普遍非常缺乏付出意识', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_002_02', 'cmti6dd1800005grtwqbodpeh', '我真的看不下去了我发言我觉得他在方方面面对一个女明星全方位的封杀和围剿', 'opening', 'weak', 'medium', 'medium', '情绪宣泄为主，非刻意设计的争议性钩子'),
    ],
    'low', 'candidate', false,
  ),

  makeKU('KU_003', 'hook', 'structural_pattern', 'Age-Marked Authority Hook',
    '用年龄标记建立\'过来人\'身份权威，让观众产生\'她有经验\'的信任感',
    'Age Marker → Humble Authority → Lesson Preview',
    '用年龄差距制造\'前辈给建议\'的心理定位',
    [
      makeEvidence('EV_003_01', 'cmtihs7200001ygrtngbm3whf', '我23岁啊，回过头看我18岁走过的路，真的是踩了太多没必要的坑了', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_003_02', 'cmtih2k420000vgrtk27ynrz4', '说难听点可能年纪稍微小一点的女孩都听不懂我在说什么就是我从17岁开始出来打拼嘛', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_003_03', 'cmtihp48w0000ygrtsrf1p1xr', '哈大家好，我是思雨，今年30岁。今天我想跟二十多岁的女生分享一个非常非常重要的事情', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_003_04', 'cmtihxd130002ygrt94ko3pre', '哈喽大家好，我是思雨，今年30岁。我今天特别想要跟你们分享一个你们肯定都懂的美丽羞耻证语', 'opening', 'valid', 'high', 'low'),
    ],
    'medium', 'validated', false,
  ),

  makeKU('KU_004', 'hook', 'structural_pattern', 'Personal Experience Scene Hook',
    '用具体的生活场景切入，从个人感受出发引出观点，制造真实感和代入感',
    'Scene → Personal Feeling → Insight Seed',
    '从具体场景切入，让观点\'有来源\'而非\'凭空而来\'',
    [
      makeEvidence('EV_004_01', 'cmtigcdp20005gsrtdhx6cxe2', '我晚上刚跟几个做生意的姐姐吃完饭，就有个很强烈的感受', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_004_02', 'cmtigbg5e0004gsrtzsv4ei7p', '我刚下来溜达了一圈，然后刷到了一条很有能量的画，分享给屏幕前的女生们', 'opening', 'valid', 'high', 'low'),
    ],
    'low', 'candidate', false,
  ),

  makeKU('KU_005', 'hook', 'structural_pattern', 'Identity-Targeted Hook',
    '直接用身份标签称呼目标观众群体，制造\'这就是在说我\'的即时识别',
    'Identity Label → Pain Point → Promise of Solution',
    '精准定位目标受众，让被点到的人产生强烈的代入感',
    [
      makeEvidence('EV_005_01', 'cmtjew7680006h0rtxogty151', '如果你天性就不是攻击性很强的人，并且因为这样的性格吃了太多的亏，那么你一定思考过一个问题', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_005_02', 'cmtjdq5oh0003h0rtjxoc0jji', '所有家庭条件一般，但是又很向往高质量生活的女性，请记住了', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_005_03', 'cmtjdtvgr0004h0rtldet37ou', '女人的能力是什么她必须要清楚怎么让自己变成一个紧密女孩', 'opening', 'weak', 'medium', 'medium', '缺乏明确的\'如果你...\'结构，不够精准指向'),
    ],
    'medium', 'validated', false,
  ),

  makeKU('KU_006', 'structure', 'structural_pattern', 'Concept-Naming Insight Structure',
    '用一个新概念命名观众熟悉但无法清晰表达的体验，然后用对比解释概念',
    'Concept Naming → Contrast Definition → Progressive Revelation',
    '用简单概念解释复杂体验，让观众产生\'原来这叫这个\'的顿悟感',
    [
      makeEvidence('EV_006_01', 'cmtifxn9r0001gsrtxnkvbmzf', '我今天想讲一个很多女孩子都在经历，但是不一定说得清楚的东西，叫低配关系', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_006_02', 'cmtiimd0m0000h0rtjldcal7m', '我把它叫做爱己商', 'opening', 'valid', 'high', 'low'),
    ],
    'low', 'candidate', false,
    { note: '原第3条证据已移除（属认知重命名而非概念命名）。仅2条证据，<3 unique content，不满足validated条件' },
  ),

  makeKU('KU_007', 'structure', 'structural_pattern', 'Listicle Knowledge Output',
    '用编号列表传递大量信息，结构清晰但需要避免过度格式化以保持自然感',
    'Numbered List → Quick Scanning → Save for Later',
    '高密度信息传递，便于观众快速获取和收藏',
    [
      makeEvidence('EV_007_01', 'cmtifwg6z0000gsrth3uzhlxv', '一、能问豆包解决的事情，就不要老是问别人。2、没必要在职场里面交朋友', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_007_02', 'cmtih97vu0001vgrtaeed76g1', '一货都是从口出的，一年学说话，十年学闭嘴', 'body', 'weak', 'medium', 'low', '谚语/格言形式，非典型清单体'),
      makeEvidence('EV_007_03', 'cmtihs7200001ygrtngbm3whf', '首先第一个，18岁以后你就要开始为自己的人生负责了', 'body', 'valid', 'high', 'low'),
    ],
    'medium', 'validated', false,
  ),

  makeKU('KU_008', 'emotion', 'structural_pattern', 'Regret-to-Wisdom Emotional Arc',
    '从遗憾情绪出发，通过\'过来人\'视角传递经验，制造\'我不想你重蹈覆辙\'的关怀感',
    'Personal Regret → Lesson Extraction → Warning/Advice',
    '用个人遗憾作为情感钩子，用经验作为解决方案',
    [
      makeEvidence('EV_008_01', 'cmtifxn9r0001gsrtxnkvbmzf', '我后来越来越明白，一个女生要是想要活得轻松一点，那你就一定要学会去识别低配关系', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_008_02', 'cmtihs7200001ygrtngbm3whf', '我23岁啊，回过头看我18岁走过的路，真的是踩了太多没必要的坑了', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_008_03', 'cmtigcdp20005gsrtdhx6cxe2', '我晚上刚跟几个做生意的姐姐吃完饭，就有个很强烈的感受', 'opening', 'weak', 'medium', 'low', '场景开场白，未展示遗憾到智慧的情感弧线'),
    ],
    'medium', 'validated', false,
  ),

  makeKU('KU_009', 'emotion', 'structural_pattern', 'Shared Experience Empathy',
    '描述一个群体共有的模糊感受，让观众产生\'她懂我\'的强烈共鸣',
    'Shared Pain → Validation → You\'re Not Alone',
    '通过描述共同体验，让观众感到被理解和被看见',
    [
      makeEvidence('EV_009_01', 'cmtih2k420000vgrtk27ynrz4', '可能只有经历过的女生才懂', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_009_02', 'cmtjeb56p0005h0rtbxah3hg7', '人这一辈子无非都在追求爱这个字', 'body', 'weak', 'medium', 'low', '泛化陈述，未能精准描述共同体验'),
      makeEvidence('EV_009_03', 'cmtjiepr30007h0rte9vu5isw', '我的高中三年就充斥着两件事。第一件事是人际关系，就特别害怕落单的窘迫', 'body', 'valid', 'medium', 'low', '具体个人经历，可能触发群体共鸣'),
    ],
    'medium', 'validated', false,
  ),

  makeKU('KU_010', 'perspective', 'strategic_pattern', 'Direct Address Empowerment',
    '用\'姐妹/女生\'直接称呼观众，配合赋能式语言建立情感连接和信任',
    'Direct Address → Empowerment Statement → Actionable Advice',
    '建立\'自己人\'的感觉，降低防御心理，增强说服力',
    [
      makeEvidence('EV_010_01', 'cmtifxn9r0001gsrtxnkvbmzf', '姐妹们，任何一段让你长期掉状态的关系，本质上它都不是滋养你的，是消耗', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_010_02', 'cmtigbg5e0004gsrtzsv4ei7p', '姐妹们记住，你的财富就是你身边最亲近的五个人的平均值', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_010_03', 'cmti6dd1800005grtwqbodpeh', '所以呢我真心建议所有年轻女孩子，真的一定要给自己建立一个判断标准', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_010_04', 'cmtihgl3w0002vgrtbq1kmwbt', '所以姐妹你们一定一定要记得，千万千万要把优质蛋白、优质脂肪这东西给它补上来', 'body', 'valid', 'high', 'low'),
    ],
    'medium', 'validated', false,
  ),

  makeKU('KU_011', 'perspective', 'strategic_pattern', 'First-Person Vulnerability Lens',
    '用第一人称分享个人经历和脆弱时刻，建立真实感和信任感',
    'Vulnerability → Relatability → Trust Building',
    '通过暴露脆弱打破\'完美博主\'距离感，让观众觉得\'她和我一样\'',
    [
      makeEvidence('EV_011_01', 'cmtiexhr9000068rtqeib610v', '我以前也不敢做自媒体，不敢面对镜头，说话都磕巴', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_011_02', 'cmtigbg5e0004gsrtzsv4ei7p', '我之前135斤，我靠运动瘦了20斤。但是我瘦下来的结果皮脂醇增高，暴饮暴食，反弹就恶性循环', 'opening', 'valid', 'high', 'low'),
      makeEvidence('EV_011_03', 'cmtihxd130002ygrt94ko3pre', '我曾经就是这样的人，总是顾全大局，所以很少当众发泄情绪', 'opening', 'valid', 'high', 'low'),
    ],
    'medium', 'validated', false,
    { note: '原第4条重复证据已移除' },
  ),

  makeKU('KU_012', 'language', 'surface_technique', 'Not-A-But-B Cognitive Contrast',
    '用\'不是A，而是B\'的句式重新定义概念，制造认知反转',
    'Not A → Redefine as B → Reframing',
    '用对比重新定义概念，赋予旧事物新意义',
    [
      makeEvidence('EV_012_01', 'cmti6dd1800005grtwqbodpeh', '你化的不是妆，那是你的价值；你穿的不是衣服，那是你的品质；你减的也不是肥，那是对你人生的重塑啊', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_012_02', 'cmtih97vu0001vgrtaeed76g1', '抢男人有什么意思？抢男人饭碗才有意思', 'body', 'weak', 'medium', 'low', '反问+对比，非严格not-A-but-B结构'),
      makeEvidence('EV_012_03', 'cmtig0aoa0002gsrtbh7hywcp', '如果你拥有顶级的颜值和背景，那你当然可以什么都不用付出，就有人前赴后继来为你付出，只求你给一个好脸色。但问题你不是，我也不是', 'body', 'weak', 'medium', 'low', '情境对比+反转，非严格not-A-but-B'),
    ],
    'medium', 'candidate', false,
    { note: '状态由validated修正为candidate：3条evidence中仅1条trusted（2条caution），不满足>=2条trusted条件' },
  ),

  makeKU('KU_013', 'language', 'surface_technique', 'Imperative Direct Command',
    '用\'你就记住啊\'、\'你给我\'等直接命令式表达，制造权威感和紧迫感',
    'Command → Reason → Compliance',
    '用直接命令式表达打破观众心理防御，增强说服力',
    [
      makeEvidence('EV_013_01', 'cmti6dd1800005grtwqbodpeh', '你就记住啊，你化的不是妆，那是你的价值', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_013_02', 'cmtihgl3w0002vgrtbq1kmwbt', '你就直接去把你的这个肩膀给我打开，把你的背停下来', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_013_03', 'cmtifxn9r0001gsrtxnkvbmzf', '你付出了时间、付出了情绪、付出了耐心、付出了理解，可是你得到的却是反复的失望', 'body', 'weak', 'medium', 'low', '排比描述为主，无直接命令'),
      makeEvidence('EV_013_04', 'cmtjew7680006h0rtxogty151', '不要告诉任何人你的过去', 'body', 'valid', 'high', 'low'),
    ],
    'medium', 'validated', false,
  ),

  makeKU('KU_014', 'cognition', 'strategic_pattern', 'Expectation Reversal Pattern',
    '挑战观众固有认知，用反直觉但逻辑自洽的观点制造认知冲击',
    'Common Belief → Challenge → Reversed Truth',
    '打破思维定式，制造\'原来我一直是错的\'的认知刷新',
    [
      makeEvidence('EV_014_01', 'cmtig0aoa0002gsrtbh7hywcp', '我们一直以为追求被爱很重要，后来才发现，更重要的是学会爱自己', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_014_02', 'cmtifxn9r0001gsrtxnkvbmzf', '我们一直以为女性天生恋爱脑，但这根本就是个谎言', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_014_03', 'cmtigcdp20005gsrtdhx6cxe2', '只有一种恋爱模式是成功的，那就是女生懂付出，男生的有良心', 'body', 'weak', 'medium', 'low', '断言式观点，非典型的\'一直以为...其实...\'反转'),
      makeEvidence('EV_014_04', 'cmtihp48w0000ygrtsrf1p1xr', '我们以为是在找爱人，其实是在找一个能证明我值得的答案', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_014_05', 'cmtjdtvgr0004h0rtldet37ou', '世界上除了血缘关系，任何情感关系本质上都是一场价值交换', 'body', 'weak', 'medium', 'low', '断言式观点，非典型认知反转结构'),
    ],
    'medium', 'validated', false,
  ),

  makeKU('KU_015', 'cognition', 'surface_technique', 'Specific Number Argumentation',
    '用具体数字增强说服力，让抽象观点变得可感知、可验证',
    'Concrete Numbers → Concrete Scenarios → Believability',
    '用具体数字让抽象道理变得触手可及，增强可信度',
    [
      makeEvidence('EV_015_01', 'cmtig0aoa0002gsrtbh7hywcp', '很多女生宁愿花1万块去婚恋机构找什么所谓的A8A9优质单身男，就算知道可能会被骗，也不舍得在自己的男朋友身上花这1万块钱', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_015_02', 'cmtihxd130002ygrt94ko3pre', '一周至少要吃三次三文鱼', 'body', 'weak', 'medium', 'low', '简单数据陈述，缺乏论证力度'),
      makeEvidence('EV_015_03', 'cmtiimd0m0000h0rtjldcal7m', '我瘦下来的结果皮脂醇增高，暴饮暴食，反弹就恶性循环，整整的持续了八年的时间', 'body', 'valid', 'high', 'low'),
    ],
    'medium', 'validated', false,
  ),

  makeKU('KU_016', 'human_expression', 'expression_principle', 'Natural Cognitive Trace',
    '允许语言存在自然的思考和连接痕迹，避免过度工整、过度完整、过度书面。核心是表达背后的真实思维流动感。',
    'Natural Connector → Processing Signal → Authentic Flow',
    '让表达更像真实思考而非排练过的稿子，降低AI味',
    [
      makeEvidence('EV_016_01', 'cmtjdlzuo0001h0rtll7p5uax', '就是当我第一次听到这个词的时候，我会觉得有点笼统', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_016_02', 'cmtihxd130002ygrt94ko3pre', '嗯，就是当你第一次听到这个词的时候', 'body', 'valid', 'medium', 'medium', '\'嗯\'可能是口语填充词，也可能是ASR噪音'),
      makeEvidence('EV_016_03', 'cmtiexhr9000068rtqeib610v', '哎，对我来说菜单是全英文的，看不懂的都叫高端局哈', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_016_04', 'cmtihgl3w0002vgrtbq1kmwbt', '那个说话的语气，那些小动作、小的微表情，你就不放心跟他过钱儿', 'body', 'valid', 'medium', 'low', '口语化列举，思维自然流动'),
      makeEvidence('EV_016_05', 'cmtjeb56p0005h0rtbxah3hg7', '人这一辈子无非都在追求爱这个字想要大家聊聊这个话题咱们东亚小孩', 'body', 'weak', 'low', 'high', '疑似ASR句子粘连，多个独立分句被连在一起。此证据evidence_trust=excluded，不参与Knowledge Learning'),
    ],
    'medium', 'candidate', true,
    {
      human_expression_verdict: 'confirmed',
      note: '状态由validated修正为candidate：包含1条HIGH noise_risk证据（EV_016_05 ASR句子粘连），按规则不能作为validated',
      principle: '写作时不必追求完美流畅。允许出现自然的思考连接词（其实、怎么说呢、就是、我后来发现），这些\'不完美\'恰恰是真人感的来源。',
      surface_forms: ['其实...', '怎么说呢...', '就是...', '我后来发现...', '嗯...'],
    },
  ),

  makeKU('KU_017', 'human_expression', 'expression_principle', 'Self-Correction Realness',
    '说错话后自我纠正，或绕一下再说，模拟真实说话时的思维过程',
    'Error → Self-Awareness → Correction → Humor',
    '通过暴露\'不完美\'增强真实感和可信度',
    [
      makeEvidence('EV_017_01', 'cmtiexhr9000068rtqeib610v', '我想解释一下，说这是姐夫来上海了，结果嘴一快说成了啊，这是上海的姐夫', 'body', 'valid', 'high', 'low'),
    ],
    'low', 'candidate', false,
    {
      human_expression_verdict: 'unconfirmed',
      note: '原第2、3条证据移除（非自我修正，仅为叙事）。仅1条有效证据，<3 unique content，不满足validated条件',
    },
  ),

  makeKU('KU_018', 'human_expression', 'expression_principle', 'Authenticity Marker — Emotional Pivot',
    '在轻松或叙述性内容中突然插入真实情绪，制造\'意外\'的真实感',
    'Lightness → Emotional Pivot → Authenticity Spike',
    '用情绪突转制造真实感，让内容更有记忆点',
    [
      makeEvidence('EV_018_01', 'cmtiexhr9000068rtqeib610v', '我对姐夫就是生理性喜欢', 'opening', 'weak', 'low', 'low', '孤立语句，需原视频上下文确认情绪突转'),
      makeEvidence('EV_018_02', 'cmtjeb56p0005h0rtbxah3hg7', '允许自己有脾气允许失控允许自己有随时能抽身的底气', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_018_03', 'cmtjiepr30007h0rte9vu5isw', '这种迷茫、恐惧甚至叫怯懦。我懂，因为我也曾站在那里，既不敢向前也不敢后退，所以别怕所以别怕', 'ending', 'valid', 'high', 'low'),
    ],
    'medium', 'validated', true,
    { human_expression_verdict: 'confirmed' },
  ),

  makeKU('KU_019', 'human_expression', 'expression_principle', 'Cognitive Veracity Signal',
    '句子不完整或意思到了就跳下一句，模拟真实说话时的思维跳跃。这是认知真实感的信号，不是语法错误。',
    'Fragment → Implied Meaning → Move On',
    '用不完整表达模拟真实思维流动，降低\'书面感\'',
    [
      makeEvidence('EV_019_01', 'cmtjdlzuo0001h0rtll7p5uax', '你要你要使劲想我该怎么把这个困难变成我的一个优势', 'body', 'valid', 'medium', 'medium', '\'你要你要\'可能是口头自我修正，也可能是ASR重复'),
      makeEvidence('EV_019_02', 'cmtjeb56p0005h0rtbxah3hg7', '不要入任何人的局任何人说什么都不重要因为你的世界你做主就是他人的评价呀跟女女无关你也不要入儿', 'body', 'weak', 'low', 'high', '疑似ASR句子粘连，无法确认是否刻意为之的碎片化表达。evidence_trust=excluded，不参与Knowledge Learning'),
      makeEvidence('EV_019_03', 'cmtjew7680006h0rtxogty151', '我的高中三年就充斥着两件事。第一件事是人际关系，就特别害怕落单的窘迫以及额外珍视呵护的女生之间的友情。第二件事就是成绩成绩成绩学习学习学习了', 'body', 'valid', 'medium', 'medium', '\'成绩成绩成绩\'是刻意重复，但整句较长可能有ASR影响'),
      makeEvidence('EV_019_04', 'cmtih2k420000vgrtk27ynrz4', '我的高中三年就充斥着两件事', 'opening', 'valid', 'high', 'low'),
    ],
    'low', 'candidate', true,
    {
      human_expression_verdict: 'suspect',
      note: '存在高ASR噪音风险证据（excluded）；核心结论部分依赖suspect证据，无法确认真人表达vs ASR产物',
    },
  ),

  makeKU('KU_020', 'human_expression', 'expression_principle', 'Intentional Rhythm Device',
    '通过有意识地重复同一主语或句式强化情绪冲击。这是AI倾向于避免但真人常用的表达手法。',
    'Repetition → Rhythm → Emotional Intensity',
    '用重复制造节奏感和情绪递进，增强表达力度',
    [
      makeEvidence('EV_020_01', 'cmtd3jnet0000dwrtj3krmeef', '他忽略了年龄差他忽略了美貌就是一种权利他忽略了人家就是人间富贵花', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_020_02', 'cmtifxn9r0001gsrtxnkvbmzf', '你总是在解释，对方总是在敷衍你总是在付出，对方总是在享受，你总是在维系，对方总是在观望', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_020_03', 'cmtjeb56p0005h0rtbxah3hg7', '小时候追求爸妈的爱长大追求朋友的爱要求当对方的第一顺位到了谈恋爱的时候就更加疯狂了', 'body', 'valid', 'high', 'low'),
    ],
    'medium', 'validated', true,
    {
      human_expression_verdict: 'confirmed',
      note: '原第2条证据（与KU_019共享的高ASR噪音句）已移除',
    },
  ),

  makeKU('KU_021', 'ending', 'surface_technique', 'Emotional Echo Ending',
    '用重复或回环的方式结尾，制造情感余韵',
    'Emotional Statement → Echo → Gentle Close',
    '用情绪而非结论结尾，给观众留下温暖或思考的空间',
    [
      makeEvidence('EV_021_01', 'cmtjiepr30007h0rte9vu5isw', '所以别怕所以别怕', 'ending', 'valid', 'high', 'low'),
      makeEvidence('EV_021_02', 'cmtjeb56p0005h0rtbxah3hg7', '希望我说的对你们有帮助晚安女孩', 'ending', 'weak', 'medium', 'low', '一般性结束语，非典型情绪回环'),
    ],
    'low', 'candidate', true,
    { note: '仅2条证据（<3），且仅1条trusted，不满足validated条件' },
  ),

  makeKU('KU_022', 'ending', 'surface_technique', 'Action Prompt Ending',
    '用明确的行动号召结尾，引导观众做出具体行为',
    'Urgency → Action Request → Compliance',
    '制造紧迫感，引导互动行为',
    [
      makeEvidence('EV_022_01', 'cmtihs7200001ygrtngbm3whf', '视频可能随时会被下架，最好把我设成特别关注啊', 'ending', 'valid', 'high', 'low'),
      makeEvidence('EV_022_02', 'cmtifwg6z0000gsrth3uzhlxv', '你们可以艾一下豆包，给你们整理一个那种什么思维导图', 'ending', 'weak', 'medium', 'low', '软性建议，非强烈行动号召'),
      makeEvidence('EV_022_03', 'cmtiimd0m0000h0rtjldcal7m', '所以如果你想看，一定要记得关注我的这个账号和我的这个系列', 'ending', 'valid', 'high', 'low'),
      makeEvidence('EV_022_04', 'cmtihp48w0000ygrtko3pre', '真的很建议屏幕前的你们去关注这几个博主，真的会打开你的认知', 'ending', 'valid', 'high', 'low'),
    ],
    'medium', 'validated', true,
  ),

  makeKU('KU_023', 'structure', 'structural_pattern', 'Contrast Pair Explanation',
    '用正反对比解释概念，让抽象概念变得清晰可感',
    'Contrast A vs B → Concept Clarification',
    '用对比让观众快速理解复杂概念的本质差异',
    [
      makeEvidence('EV_023_01', 'cmtifxn9r0001gsrtxnkvbmzf', '你总是在解释，对方总是在敷衍你总是在付出，对方总是在享受，你总是在维系，对方总是在观望', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_023_02', 'cmtigcdp20005gsrtdhx6cxe2', '一个完成了自身商业化，跟真实世界交过手的女性，她整个人呈现出来的状态是完全不一样的', 'body', 'weak', 'medium', 'low', '描述性对比，非严格正反对照结构'),
      makeEvidence('EV_023_03', 'cmtig0aoa0002gsrtbh7hywcp', '很多女生宁愿花1万块去婚恋机构找什么所谓的A8A9优质单身男，就算知道可能会被骗，也不舍得在自己的男朋友身上花这1万块钱', 'body', 'valid', 'high', 'low'),
    ],
    'medium', 'validated', false,
  ),

  makeKU('KU_024', 'cognition', 'strategic_pattern', 'Reframing Definition',
    '重新定义观众熟悉的概念，赋予旧词新义或颠覆其原有含义',
    'Old Concept → New Definition → Perspective Shift',
    '通过重新定义改变观众的思考框架',
    [
      makeEvidence('EV_024_01', 'cmtifxn9r0001gsrtxnkvbmzf', '什么叫低配关系？就是你总是在解释，对方总是在敷衍', 'body', 'valid', 'high', 'low'),
      makeEvidence('EV_024_02', 'cmtihs7200001ygrtngbm3whf', '一个女生真正的成熟不是多会忍，而是你终于知道什么关系该留，什么关系必须要放', 'body', 'valid', 'high', 'low'),
    ],
    'low', 'candidate', false,
    { note: '仅2条证据（<3），不满足validated条件' },
  ),
];

// Compute statistics
let totalEvidence = 0;
let evidenceValid = 0;
let evidenceWeak = 0;
let evidenceTrusted = 0;
let evidenceCaution = 0;
let evidenceExcluded = 0;
let highNoise = 0;
let mediumNoise = 0;
let lowNoise = 0;
let validatedCount = 0;
let candidateCount = 0;
let reclassifiedCount = 0;
let humanConfirmed = 0;
let humanUnconfirmed = 0;
let humanSuspect = 0;

const levelDist: Record<string, number> = { strategic_pattern: 0, structural_pattern: 0, expression_principle: 0, surface_technique: 0 };
const catDist: Record<string, number> = {};

for (const ku of kus) {
  if (ku.status === 'validated') validatedCount++;
  if (ku.status === 'candidate') candidateCount++;
  if (ku.reclassified) reclassifiedCount++;
  if (ku.human_expression_verdict === 'confirmed') humanConfirmed++;
  if (ku.human_expression_verdict === 'unconfirmed') humanUnconfirmed++;
  if (ku.human_expression_verdict === 'suspect') humanSuspect++;

  levelDist[ku.knowledge_level]++;
  catDist[ku.category] = (catDist[ku.category] || 0) + 1;

  for (const ev of ku.evidence.items) {
    totalEvidence++;
    if (ev.validation === 'valid') evidenceValid++;
    if (ev.validation === 'weak') evidenceWeak++;
    if (ev.noise_risk === 'high') highNoise++;
    if (ev.noise_risk === 'medium') mediumNoise++;
    if (ev.noise_risk === 'low') lowNoise++;
    if (ev.evidence_trust === 'trusted') evidenceTrusted++;
    if (ev.evidence_trust === 'caution') evidenceCaution++;
    if (ev.evidence_trust === 'excluded') evidenceExcluded++;
  }
}

const output = {
  version: '2.1',
  date: '2026-09-02',
  phase: 'P0.2.2.1-FIX Knowledge Cleanup Consistency Repair',
  total_knowledge_units: 24,
  statistics: {
    validated: validatedCount,
    candidate: candidateCount,
    reclassified: reclassifiedCount,
    rejected: 0,
    total_evidence_before: 80,
    total_evidence_after: totalEvidence,
    evidence_valid: evidenceValid,
    evidence_weak: evidenceWeak,
    evidence_duplicate_removed: 1,
    evidence_invalid_removed: 5,
    evidence_trusted: evidenceTrusted,
    evidence_caution: evidenceCaution,
    evidence_excluded: evidenceExcluded,
    high_noise_risk: highNoise,
    medium_noise_risk: mediumNoise,
    low_noise_risk: lowNoise,
    knowledge_level_distribution: levelDist,
    category_distribution: catDist,
    human_expression: {
      confirmed: humanConfirmed,
      unconfirmed: humanUnconfirmed,
      suspect: humanSuspect,
    },
  },
  knowledge_units: kus,
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
console.log(`Written to ${OUTPUT_PATH}`);
console.log(`Total KUs: ${kus.length}`);
console.log(`Validated: ${validatedCount} | Candidate: ${candidateCount}`);
console.log(`Reclassified: ${reclassifiedCount}`);
console.log(`Evidence: ${totalEvidence} | Trusted: ${evidenceTrusted} | Caution: ${evidenceCaution} | Excluded: ${evidenceExcluded}`);
console.log(`Noise: High=${highNoise} | Medium=${mediumNoise} | Low=${lowNoise}`);
console.log(`Levels: Strategic=${levelDist.strategic_pattern} | Structural=${levelDist.structural_pattern} | Expression=${levelDist.expression_principle} | Surface=${levelDist.surface_technique}`);
console.log(`Human: Confirmed=${humanConfirmed} | Unconfirmed=${humanUnconfirmed} | Suspect=${humanSuspect}`);
