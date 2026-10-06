// Source positions are UTF-16 offsets, matching CodeMirror and saved color ranges.
const displayEnvironments=new Set(['align','aligned','alignat','cases','dcases','rcases','pmatrix','bmatrix','vmatrix','Vmatrix','matrix','array','gather','gathered','split','equation','multline']);
const isLetter=char=>!!char&&/[A-Za-z]/.test(char);
const isDigit=char=>!!char&&char>='0'&&char<='9';
const isMathSymbol=char=>!!char&&'_^=+*/<>()[].,-'.includes(char);
const isMathStart=char=>isLetter(char)||isDigit(char);
const isCjk=char=>!!char&&/[^\x00-\x7f]/.test(char);

function environmentAt(source,start) {
  if(!source.startsWith('\\begin{',start))return null;
  const closeName=source.indexOf('}',start+7);
  if(closeName<0)return null;
  const name=source.slice(start+7,closeName);
  if(!name||![...name].every(char=>isLetter(char)||char==='*'))return null;
  const open='\\begin{'+name+'}',close='\\end{'+name+'}';
  let depth=1,cursor=closeName+1;
  while(cursor<source.length){
    if(source.startsWith(open,cursor)){depth++;cursor+=open.length;continue;}
    if(source.startsWith(close,cursor)){depth--;cursor+=close.length;if(depth===0)return {to:cursor,displayMode:displayEnvironments.has(name.replace(/\*$/,''))};continue;}
    cursor++;
  }
  return null;
}

function mathEnd(source,start) {
  const startsWithCommand=source[start]==='\\'&&isLetter(source[start+1]);
  if(!startsWithCommand&&!isMathStart(source[start]))return start;
  const integral=startsWithCommand&&['int','iint','iiint','oint'].some(command=>source.startsWith('\\'+command,start)&&!isLetter(source[start+command.length+1]));
  let cursor=start,braces=0,brackets=0,hasMath=startsWithCommand,finishedGroup=false;
  while(cursor<source.length){
    const char=source[cursor],next=source[cursor+1],prev=source[cursor-1];
    if(char==='\n'||char==='\r'||isCjk(char))break;
    if(char==='\\'){
      if(!isLetter(next))break;
      hasMath=true;cursor+=2;
      while(isLetter(source[cursor]))cursor++;
      finishedGroup=false;
      continue;
    }
    if(char===' '||char==='\t'){
      if(braces||brackets){cursor++;continue;}
      let look=cursor;while(source[look]===' '||source[look]==='\t')look++;
      const following=source[look];
      if((integral&&isMathStart(following)&&!(prev==='x'&&source[cursor-2]==='d'))||
        ((isMathSymbol(prev)&&'=+*/<>-'.includes(prev))||(isMathSymbol(following)&&'=+*/<>-'.includes(following)))&&(isMathStart(following)||following==='\\'||isMathSymbol(following))){cursor=look;continue;}
      break;
    }
    if(char==='{'){braces++;hasMath=true;finishedGroup=false;cursor++;continue;}
    if(char==='}'){
      if(!braces)break;
      braces--;finishedGroup=braces===0;cursor++;continue;
    }
    if(char==='['){brackets++;cursor++;continue;}
    if(char===']'){if(!brackets)break;brackets--;cursor++;continue;}
    if(!isMathStart(char)&&!isMathSymbol(char))break;
    if(!braces&&!brackets&&isMathStart(char)&&cursor>start){
      if(finishedGroup&&!integral)break;
      if(prev==='*'&&source[cursor-2]==='^')break;
      if(integral&&cursor>=2&&source[cursor-2]==='d'&&isLetter(prev))break;
    }
    if('^_=<>'.includes(char))hasMath=true;
    if(!isDigit(char)&&char!=='.')finishedGroup=false;
    cursor++;
  }
  while(cursor>start&&(source[cursor-1]===','||source[cursor-1]==='.'))cursor--;
  if(!hasMath||cursor<=start)return start;
  const tail=source[cursor-1];
  if(!tail||'=+/<>-_^'.includes(tail)||(tail==='*'&&source[cursor-2]!=='^'))return start;
  if(!startsWithCommand){
    const candidate=source.slice(start,cursor).replaceAll('<=','@').replaceAll('>=','@');
    for(let index=1;index<candidate.length;index++)if('=+*/<>-'.includes(candidate[index-1])&&'=+*/<>-'.includes(candidate[index]))return start;
  }
  return cursor;
}

export function tokenizeLatex(source) {
  const tokens=[];let cursor=0,textStart=0;
  const textUntil=end=>{if(end>textStart)tokens.push({type:'text',text:source.slice(textStart,end),from:textStart,to:end});};
  while(cursor<source.length){
    const char=source[cursor];
    if(char==='\n'||source.startsWith('\\\\',cursor)){
      textUntil(cursor);
      const to=cursor+(char==='\n'?1:2);
      tokens.push({type:'lineBreak',from:cursor,to});cursor=to;textStart=cursor;continue;
    }
    const environment=environmentAt(source,cursor);
    if(environment){
      textUntil(cursor);
      tokens.push({type:'math',latex:source.slice(cursor,environment.to),displayMode:environment.displayMode,from:cursor,to:environment.to});
      cursor=environment.to;textStart=cursor;continue;
    }
    if(source.startsWith('\\(',cursor)){
      const end=source.indexOf('\\)',cursor+2);
      if(end>=0){textUntil(cursor);tokens.push({type:'math',latex:source.slice(cursor+2,end),displayMode:false,from:cursor,to:end+2});cursor=end+2;textStart=cursor;continue;}
    }
    if(char==='\\'&&!isLetter(source[cursor+1])){
      textUntil(cursor);cursor++;textStart=cursor;continue;
    }
    const end=mathEnd(source,cursor);
    if(end>cursor){
      textUntil(cursor);
      tokens.push({type:'math',latex:source.slice(cursor,end),displayMode:false,from:cursor,to:end});
      cursor=end;textStart=cursor;continue;
    }
    cursor++;
  }
  textUntil(source.length);
  return tokens;
}

