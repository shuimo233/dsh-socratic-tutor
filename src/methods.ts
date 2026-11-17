export const METHOD_GROUPS = [
  {
    label: '函数与方程', methods: [
      { id: 'auxiliary-function', label: '构造辅助函数', when: '把不等式、方程或恒成立问题转成函数的符号、零点或最值问题。',
        guide: '先明确要研究的是差、比值还是符号，核对定义域和变形条件。低档提示只引导学生观察可构造的对象。' },
      { id: 'derivative-monotonicity', label: '导数与单调性', when: '用导数判断函数的单调区间、极值或零点个数。',
        guide: '先确认定义域和可导区间。由导数符号判断单调性，检查区间端点和不能求导的点。导数为零本身不足以判定极值。' },
      { id: 'parameter-separation', label: '参数分离', when: '把参数与变量分开后，用函数值域或图像交点研究解的个数。',
        guide: '先检查分离参数所需的非零或符号条件。遇到可能为零的因式，先检查该情形是否在定义域内，并回到原式核对。区分端点能否取到。' },
      { id: 'graph-intersections', label: '数形结合', when: '把方程解、参数范围或不等关系转成图像交点和位置关系。',
        guide: '明确两条图像及共同定义域，用单调性、连续性或解析条件支持交点结论。注意相切、边界及被变形排除的点。' },
    ],
  },
  {
    label: '代数与不等式', methods: [
      { id: 'substitution', label: '换元法', when: '题目中反复出现同一结构，或者换元后能化成较熟悉的式子。',
        guide: '先找重复结构，明确新变量的可取范围，最后回代并核对原条件。注意换元可能不是一一对应。' },
      { id: 'casework', label: '分类讨论', when: '参数、绝对值、分母或根的位置在不同条件下会改变解法。',
        guide: '找出触发分支的临界条件，分别检查边界情形，使各分支互斥并覆盖原定义域。' },
      { id: 'am-gm', label: '基本不等式', when: '式子可以整理出两个非负量的和与积，且需要估计最值。',
        guide: '先确认两量非负，再看和或积是否固定。检查等号条件能否与原约束同时成立，区分界与实际最值。' },
      { id: 'bounds', label: '放缩法', when: '把复杂表达式与较简单的表达式比较，以证明不等式或估计范围。',
        guide: '先分清需要上界还是下界，核对不等号方向和适用范围。若要证明精确最值，检查等号是否能取到。' },
    ],
  },
  {
    label: '圆锥曲线', methods: [
      { id: 'chord-midpoint', label: '点差法', when: '已知或要求圆锥曲线弦的中点，寻找中点坐标与弦方向的关系。',
        guide: '让学生考虑比较两个端点代入曲线方程后的差。注意竖直弦及除法的非零条件，所得关系还需结合直线与曲线确有两个不同交点。' },
      { id: 'vieta', label: '设而不求（韦达定理）', when: '联立直线与曲线后，只需要交点坐标的和、积等对称量。',
        guide: '先检查消元式是否确为二次式，以及题意所需的实根个数。再用根的和与积表示目标量，单独处理消元漏掉的直线情形。' },
    ],
  },
  {
    label: '数列', methods: [
      { id: 'telescoping', label: '裂项相消', when: '通项可拆成相邻项或固定间隔项的差，求和时中间项会抵消。',
        guide: '先验证通项拆分和下标，再观察抵消规律，核对开头和末尾的保留项。' },
      { id: 'shift-subtraction', label: '错位相减', when: '等差因子与等比因子的乘积求和，乘以公比后可让幂次对齐。',
        guide: '先找出等比因子的公比，按相同幂次对齐后再相减。保留首尾项，若公比可能为 1 则单独处理。' },
    ],
  },
  {
    label: '三角、立体几何与概率', methods: [
      { id: 'triangle-laws', label: '正弦定理与余弦定理', when: '已知部分边角，求三角形其余边角或证明边角关系。',
        guide: '按已知量和目标量选择定理，明确角及其对边。由正弦值确定角时，核对补角可能性和三角形内角条件。' },
      { id: 'space-vectors', label: '空间向量法', when: '证明空间垂直或平行，或者求线面角、二面角。',
        guide: '先找适合的坐标系或向量，辨认方向向量与法向量。求角时区分余弦、正弦及题目要求的角域。' },
      { id: 'complement', label: '对立事件法', when: '直接计算目标事件分支较多，而计算其对立事件更简单。',
        guide: '让学生在同一随机试验中准确描述对立事件。若题目有条件，则保留原条件再用概率互补关系。' },
    ],
  },
] as const

type Method = typeof METHOD_GROUPS[number]['methods'][number]
export type MethodId = Method['id']
const methods = METHOD_GROUPS.flatMap<Method>(group => group.methods)

export function findMethod(id: unknown): Method | undefined {
  return methods.find(method => method.id === id)
}
