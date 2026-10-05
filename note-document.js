// Versioned, allowlisted annotations. Legacy notes remain plain source strings.
export const TEXT_COLORS=['default','red','orange','yellow','green','cyan','blue','purple','pink','gray'];
const validMarks=(marks,length)=>marks.filter(mark=>Number.isInteger(mark.from)&&Number.isInteger(mark.to)&&mark.from>=0&&mark.to<=length&&mark.from<mark.to&&TEXT_COLORS.includes(mark.color)&&mark.color!=='default');
export function readDocument(body='') {
  if(typeof body!=='string') return {source:'',marks:[],mathColors:[]};
  try {
    const value=JSON.parse(body);
    if(value?.kind!=='study-note' || value.version!==1 || typeof value.source!=='string' || !Array.isArray(value.marks)) throw Error();
    return {source:value.source,marks:validMarks(value.marks,value.source.length),mathColors:validMarks(Array.isArray(value.mathColors)?value.mathColors:[],value.source.length)};
  } catch {return {source:body,marks:[],mathColors:[]};}
}
export function writeDocument(document) {
  return JSON.stringify({kind:'study-note',version:1,source:document.source,marks:document.marks,mathColors:document.mathColors||[]});
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
function commandEnd(source,start) {
  let end=start+1;while(/[A-Za-z]/.test(source[end]||''))end++;
  if(end===start+1)return start;
  while(source[end]==='{'){
    let depth=0;do{if(source[end]==='{')depth++;else if(source[end]==='}')depth--;end++;}while(depth>0&&end<source.length);
  }
  while(end<source.length&&/[A-Za-z0-9\\{}_^=+*/<>()[\].,-]/.test(source[end]))end++;
  return end;
}
function inlineNodes(source,from) {
  const nodes=[];let textStart=0,index=0;
  const addMath=(end,latex)=>{if(index>textStart)nodes.push({type:'text',source:source.slice(textStart,index),from:from+textStart,to:from+index});nodes.push({type:'inlineMath',source:latex,from:from+index,to:from+end});index=end;textStart=end;};
  while(index<source.length){
    if(source.startsWith('\\(',index)){const end=source.indexOf('\\)',index+2);if(end>=0){addMath(end+2,source.slice(index+2,end));continue;}}
    if(source[index]==='\\') {const end=commandEnd(source,index);if(end>index){addMath(end,source.slice(index,end));continue;}}
    if(/[A-Za-z]/.test(source[index])){
      const match=source.slice(index).match(/^[A-Za-z][A-Za-z0-9]*(?:\([^)]*\))?(?:\s*[_^=<>]\s*(?:[A-Za-z0-9]+(?:\^[A-Za-z0-9]+)?|\([^)]*\)))+/);
      if(match){addMath(index+match[0].length,match[0]);continue;}
    }
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

