// Versioned, allowlisted annotations. Legacy notes remain plain source strings.
export const TEXT_COLORS=['default','red','orange','yellow','green','cyan','blue','purple','pink','gray'];
export function readDocument(body='') {
  if(typeof body!=='string') return {source:'',marks:[]};
  try {
    const value=JSON.parse(body);
    if(value?.kind!=='study-note' || value.version!==1 || typeof value.source!=='string' || !Array.isArray(value.marks)) throw Error();
    return {source:value.source,marks:value.marks.filter(mark=>Number.isInteger(mark.from)&&Number.isInteger(mark.to)&&mark.from>=0&&mark.to<=value.source.length&&mark.from<mark.to&&TEXT_COLORS.includes(mark.color)&&mark.color!=='default')};
  } catch {return {source:body,marks:[]};}
}
export function writeDocument(document) {
  return JSON.stringify({kind:'study-note',version:1,source:document.source,marks:document.marks});
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
  // A whole formula line is math; ordinary prose and spacing remain text.
  return /\\[A-Za-z]+|[_^]|[=+*/<>]/.test(value) && !/[\u3400-\u9fff]/.test(value.replace(/\\[A-Za-z]+/g,''));
}
const cleanInvalidSlashes=source=>source.replace(/(?<!\\)\\(?![A-Za-z\\{}\[\]()%$&#_^ ,;:!])/g,'');
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
      const clean=cleanInvalidSlashes(part.source);
      result.push({type:mathLike(clean)?'math':'text',source:clean,from:part.from,to:part.from+part.source.length});
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
  return {source,marks:reconcileMarks(document.marks,document.source,source)};
}

