// Versioned, allowlisted annotations. Legacy notes remain plain source strings.
import {tokenizeLatex} from './latex-tokens.js';
import {parseLatexSource} from './latex-next-model.js';
export const TEXT_COLORS=['default','red','orange','yellow','green','cyan','blue','purple','pink','gray'];
const validMarks=(marks,length)=>marks.filter(mark=>Number.isInteger(mark.from)&&Number.isInteger(mark.to)&&mark.from>=0&&mark.to<=length&&mark.from<mark.to&&TEXT_COLORS.includes(mark.color)&&mark.color!=='default');
export function readDocument(body='') {
  if(typeof body!=='string') return {source:'',marks:[],mathColors:[]};
  try {
    const value=JSON.parse(body);
    if(value?.kind!=='study-note' || ![1,2,3,4].includes(value.version) || typeof value.source!=='string' || !Array.isArray(value.marks)) throw Error();
    const mathNodes=(value.version===4?parseLatexSource:tokenizeLatex)(value.source).filter(node=>node.type==='math');
    const savedNodes=Array.isArray(value.content)?value.content.flatMap(block=>block?.type==='line'&&Array.isArray(block.children)?block.children:[block]):[];
    const nodeColors=mathNodes.flatMap(node=>{
      // V2 used inlineMath/blockMath; V3 uses one math node with internal displayMode.
      const saved=savedNodes.find(item=>item?.latex===node.latex&&item.from<=node.from&&item.to>=node.to&&['math','inlineMath','blockMath'].includes(item.type));
      return saved&&TEXT_COLORS.includes(saved.color)&&saved.color!=='default'?[{from:node.from,to:node.to,color:saved.color}]:[];
    });
    return {source:value.source,marks:validMarks(value.marks,value.source.length),mathColors:value.version>=2?nodeColors:validMarks(Array.isArray(value.mathColors)?value.mathColors:[],value.source.length)};
  } catch {return {source:body,marks:[],mathColors:[]};}
}
export function writeDocument(document) {
  return JSON.stringify({kind:'study-note',version:4,source:document.source,marks:validMarks(document.marks||[],document.source.length),content:documentTokens(document)});
}
export function documentTokens(document) {
  const colorFor=node=>document.mathColors?.find(mark=>mark.from===node.from&&mark.to===node.to)?.color||null;
  return parseLatexSource(document.source).map(node=>node.type==='math'?{...node,color:colorFor(node)}:node);
}
