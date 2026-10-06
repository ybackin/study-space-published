export const formulaGroups=[
  ['常用',[['分式','\\frac{}{}'],['根号','\\sqrt{}'],['上标','^{}'],['下标','_{}'],['积分','\\int_{a}^{b}'],['求和','\\sum_{i=1}^{n}']]],
  ['希腊字母',[['α','\\alpha'],['β','\\beta'],['γ','\\gamma'],['θ','\\theta'],['π','\\pi'],['μ','\\mu'],['σ','\\sigma'],['ω','\\omega']]],
  ['分式',[['分式','\\frac{}{}'],['大分式','\\dfrac{}{}'],['二项式','\\binom{}{}']]],
  ['根式',[['平方根','\\sqrt{}'],['n 次根','\\sqrt[n]{}']]],
  ['上下标',[['上标','^{}'],['下标','_{}'],['平方','^{2}'],['第 i 项','_{i}']]],
  ['极限',[['极限','\\lim_{x\\to 0}'],['无穷','\\infty'],['趋于','\\to']]],
  ['三角函数',[['sin','\\sin'],['cos','\\cos'],['tan','\\tan'],['arcsin','\\arcsin'],['log','\\log'],['ln','\\ln']]],
  ['积分',[['积分','\\int_{a}^{b}'],['二重积分','\\iint'],['三重积分','\\iiint'],['围道积分','\\oint']]],
  ['求和',[['求和','\\sum_{i=1}^{n}'],['乘积','\\prod_{i=1}^{n}']]],
  ['大型运算',[['并集','\\bigcup'],['交集','\\bigcap'],['乘积','\\prod'],['求和','\\sum']]],
  ['括号',[['圆括号','\\left(\\right)'],['方括号','\\left[\\right]'],['花括号','\\left\\{\\right\\}'],['尖括号','\\langle\\rangle']]],
  ['矩阵',[['圆括矩阵','\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}'],['方括矩阵','\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}'],['分段函数','\\begin{cases}x,&x>0\\\\0,&x\\leq0\\end{cases}'],['对齐推导','\\begin{aligned}y&=a+b\\\\&=c\\end{aligned}']]]
];

export const completionTemplates=[...new Map(formulaGroups.flatMap(([,items])=>items).filter(([,latex])=>latex.startsWith('\\')).map(([label,latex])=>[latex,[latex,label]])).values()];

