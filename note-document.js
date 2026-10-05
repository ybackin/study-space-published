// Versioned, allowlisted annotations. Legacy notes remain plain source strings.
export const TEXT_COLORS=['default','red','orange','yellow','green','cyan','blue','purple','pink','gray'];
const validMarks=(marks,length)=>marks.filter(mark=>Number.isInteger(mark.from)&&Number.isInteger(mark.to)&&mark.from>=0&&mark.to<=length&&mark.from<mark.to&&TEXT_COLORS.includes(mark.color)&&mark.color!=='default');
export function readDocument(body='') {
  if(typeof body!=='string') return {source:'',marks:[],mathColors:[]};
  try {
    const value=JSON.parse(body);
    if(value?.kind!=='study-note' || ![1,2].includes(value.version) || typeof value.source!=='string' || !Array.isArray(value.marks)) throw Error();
    const parsed=blocks(value.source),mathNodes=parsed.flatMap(block=>block.type==='line'?block.children:[block]).filter(node=>node.type==='inlineMath'||node.type==='blockMath');
    const savedNodes=Array.isArray(value.content)?value.content.flatMap(block=>block?.type==='line'&&Array.isArray(block.children)?block.children:[block]):[];
    const nodeColors=mathNodes.flatMap(node=>{
      const saved=savedNodes.find(item=>item?.type===node.type&&item.from===node.from&&item.to===node.to&&item.latex===node.source);
      return saved&&TEXT_COLORS.includes(saved.color)&&saved.color!=='default'?[{from:node.from,to:node.to,color:saved.color}]:[];
    });
    return {source:value.source,marks:validMarks(value.marks,value.source.length),mathColors:value.version===2?nodeColors:validMarks(Array.isArray(value.mathColors)?value.mathColors:[],value.source.length)};
  } catch {return {source:body,marks:[],mathColors:[]};}
}
export function writeDocument(document) {
  return JSON.stringify({kind:'study-note',version:2,source:document.source,marks:validMarks(document.marks||[],document.source.length),content:documentBlocks(document)});
}
export function documentBlocks(document) {
  const colorFor=node=>document.mathColors?.find(mark=>mark.from===node.from&&mark.to===node.to)?.color||null;
  const mapNode=node=>node.type==='inlineMath'||node.type==='blockMath'?{type:node.type,latex:node.source,from:node.from,to:node.to,color:colorFor(node)}:{type:'text',text:node.source,from:node.from,to:node.to};
  return blocks(document.source).map(block=>block.type==='line'?{type:'line',from:block.from,to:block.to,children:block.children.map(mapNode)}:block.type==='blockMath'?mapNode(block):{type:'break'});
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
function mathLike(value) {
  // Punctuation alone is prose. Only a complete mathematical expression is a block.
  return !/[\u3400-\u9fff]/.test(value) && (/\\[A-Za-z]+/.test(value) || /[A-Za-z0-9)]\s*[_^=<>]\s*[A-Za-z0-9({\\]/.test(value));
}
const cleanInvalidSlashes=source=>source.replace(/(?<!\\)\\(?![A-Za-z\\{}\[\]()%$&#_^ ,;:!])/g,'');
function mathRunEnd(source,start) {
  if(!/[A-Za-z]/.test(source[start]||'')&&!(source[start]==='\\'&&/[A-Za-z]/.test(source[start+1]||'')))return start;
  let end=start,braces=0;
  while(end<source.length){
    const char=source[end];
    if(char==='{' ) braces++;
    else if(char==='}') {if(!braces)break;braces--;}
    else if(char===' '&&braces===0)break;
    else if(!/[A-Za-z0-9\\_^=+*/<>()[\].,-]/.test(char)&&char!==' ')break;
    end++;
  }
  while(end>start&&/[.,]$/.test(source.slice(end-1,end)))end--;
  const candidate=source.slice(start,end);
  if(braces||!/(\\[A-Za-z]+|[_^=<>])/.test(candidate)||/[=<>+\-/_^]$/.test(candidate)||/[+*/=<>-]{2,}/.test(candidate))return start;
  return end;
}
function inlineNodes(source,from) {
  const nodes=[];let textStart=0,index=0;
  const addMath=(end,latex)=>{if(index>textStart)nodes.push({type:'text',source:source.slice(textStart,index),from:from+textStart,to:from+index});nodes.push({type:'inlineMath',source:latex,from:from+index,to:from+end});index=end;textStart=end;};
  while(index<source.length){
    if(source.startsWith('\\(',index)){const end=source.indexOf('\\)',index+2);if(end>=0){addMath(end+2,source.slice(index+2,end));continue;}}
    const end=mathRunEnd(source,index);
    if(end>index){addMath(end,source.slice(index,end));continue;}
    index++;
  }
  if(textStart<source.length||!nodes.length)nodes.push({type:'text',source:source.slice(textStart),from:from+textStart,to:from+source.length});
  return nodes;
}
export function blocks(source) {
  const result=[];let offset=0;
  for(const raw of source.split('\n')) {
    const parts=[];let start=0,environment=false;
    for(let i=0;i<raw.length;i++) {
      if(raw.startsWith('\\begin{',i)) environment=true;
      if(raw.startsWith('\\end{',i)) environment=false;
      if(raw[i]!=='\\'||environment)continue;
      let j=i;while(raw[j]==='\\')j++;
      const pairs=Math.floor((j-i)/2);
      if(pairs){
        if(i>start)parts.push({source:raw.slice(start,i),from:offset+start});
        for(let p=0;p<pairs;p++)parts.push({break:true});
        start=i+pairs*2;i=start-1;
      }
    }
    if(start<raw.length||!parts.length)parts.push({source:raw.slice(start),from:offset+start});
    for(const part of parts) {
      if(part.break){result.push({type:'break'});continue;}
      const clean=cleanInvalidSlashes(part.source),trimmed=clean.trim();
      if(trimmed&&mathLike(trimmed))result.push({type:'blockMath',source:trimmed,from:part.from,to:part.from+part.source.length});
      else result.push({type:'line',children:inlineNodes(clean,part.from),from:part.from,to:part.from+part.source.length});
    }
    result.push({type:'break'});offset+=raw.length+1;
  }
  result.pop();return result;
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

