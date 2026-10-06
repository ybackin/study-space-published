// Versioned, allowlisted annotations. Legacy notes remain plain source strings.
import {tokenizeLatex} from './latex-tokens.js';
export const TEXT_COLORS=['default','red','orange','yellow','green','cyan','blue','purple','pink','gray'];
const validMarks=(marks,length)=>marks.filter(mark=>Number.isInteger(mark.from)&&Number.isInteger(mark.to)&&mark.from>=0&&mark.to<=length&&mark.from<mark.to&&TEXT_COLORS.includes(mark.color)&&mark.color!=='default');
export function readDocument(body='') {
  if(typeof body!=='string') return {source:'',marks:[],mathColors:[]};
  try {
    const value=JSON.parse(body);
    if(value?.kind!=='study-note' || ![1,2,3].includes(value.version) || typeof value.source!=='string' || !Array.isArray(value.marks)) throw Error();
    const mathNodes=tokenizeLatex(value.source).filter(node=>node.type==='math');
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
  return JSON.stringify({kind:'study-note',version:3,source:document.source,marks:validMarks(document.marks||[],document.source.length),content:documentTokens(document)});
}
export function documentTokens(document) {
  const colorFor=node=>document.mathColors?.find(mark=>mark.from===node.from&&mark.to===node.to)?.color||null;
  return tokenizeLatex(document.source).map(node=>node.type==='math'?{...node,color:colorFor(node)}:node);
}
export function reconcileMarks(marks,before,after) {
  let start=0;while(start<before.length&&start<after.length&&before[start]===after[start]) start++;
  let oldEnd=before.length,newEnd=after.length;
  while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
  const delta=newEnd-oldEnd;
  return marks.flatMap(mark=>{
    if(mark.to<=start) return [mark];
    if(mark.from>=oldEnd) return [{...mark,from:mark.from+delta,to:mark.to+delta}];
    if(mark.from<start&&mark.to>oldEnd) return [{...mark,to:mark.to+delta}];
    if(mark.from<start) return [{...mark,to:start}];
    if(mark.to>oldEnd) return [{...mark,from:newEnd,to:mark.to+delta}];
    return [];
  }).filter(mark=>mark.from<mark.to);
}
export function colorRange(marks,from,to,color) {
  if(!TEXT_COLORS.includes(color)||from>=to) return marks;
  const next=marks.flatMap(mark=>{
    if(mark.to<=from||mark.from>=to)return [mark];
    const pieces=[];if(mark.from<from)pieces.push({...mark,to:from});if(mark.to>to)pieces.push({...mark,from:to});return pieces;
  });
  if(color!=='default')next.push({from,to,color});
  return next.sort((a,b)=>a.from-b.from);
}
const cleanInvalidSlashes=source=>source.replace(/(?<!\\)\\(?![A-Za-z\\{}\[\]()%$&#_^ ,;:!])/g,'');
export function blocks(source) {
  const result=[];let children=[],lineStart=0;
  const flush=(to,force=false)=>{
    if(!children.length&&!force)return;
    result.push({type:'line',children:children.length?children:[{type:'text',source:'',from:lineStart,to:lineStart}],from:lineStart,to});
    children=[];
  };
  for(const token of tokenizeLatex(source)){
    if(token.type==='lineBreak'){
      flush(token.from,true);result.push({type:'break'});lineStart=token.to;continue;
    }
    if(token.type==='math'&&token.displayMode){flush(token.from);result.push({type:'blockMath',source:token.latex,from:token.from,to:token.to});lineStart=token.to;continue;}
    children.push(token.type==='text'?{type:'text',source:token.text,from:token.from,to:token.to}:{type:'inlineMath',source:token.latex,from:token.from,to:token.to});
  }
  flush(source.length,children.length>0||!result.length||source.endsWith('\n')||source.endsWith('\\\\'));
  return result;
}
export function visibleMathSpaces(source) {
  // TeX collapses ordinary source spaces. Explicit math spacing preserves intent.
  if(source.includes('\\begin{'))return source;
  return source.replace(/ +/g,spaces=>'\\;'.repeat(spaces.length));
}
export function finishedDocument(document) {
  const source=cleanInvalidSlashes(document.source);
  return {source,marks:reconcileMarks(document.marks,document.source,source),mathColors:reconcileMarks(document.mathColors||[],document.source,source)};
}

