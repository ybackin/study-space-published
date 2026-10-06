import {tokenizeLatex} from './latex-tokens.js';
import {visibleMathSpaces} from './note-document.js';

const previews=new WeakMap();
let nextMathId=1;
const el=(name,className)=>{const node=document.createElement(name);node.className=className;return node;};

function changeRange(before,after){
  let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;
  let oldEnd=before.length,newEnd=after.length;
  while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
  return {start,oldEnd,delta:newEnd-oldEnd};
}

function reconcile(parent,children){
  const keep=new Set(children);
  for(const child of [...parent.childNodes])if(!keep.has(child))child.remove();
  children.forEach((child,index)=>{if(parent.childNodes[index]!==child)parent.insertBefore(child,parent.childNodes[index]||null);});
}

function textParts(token,marks){
  const cuts=[token.from,token.to];
  for(const mark of marks){if(mark.from>token.from&&mark.from<token.to)cuts.push(mark.from);if(mark.to>token.from&&mark.to<token.to)cuts.push(mark.to);}
  cuts.sort((a,b)=>a-b);
  return cuts.slice(1).flatMap((to,index)=>{
    const from=cuts[index];if(from>=to)return [];
    const color=marks.find(mark=>mark.from<=from&&mark.to>=to)?.color;
    const span=el('span','preview-text'+(color?' text-color-'+color:''));
    span.textContent=token.text.slice(from-token.from,to-token.from);
    return [span];
  });
}

export function renderLatexPreview(target,document){
  const source=document.source||'',marks=document.marks||[],mathColors=document.mathColors||[];
  if(!source.trim()){
    previews.delete(target);const placeholder=el('span','preview-placeholder');placeholder.textContent='直接输入正文或公式，例如 \\frac{a}{b}。';target.replaceChildren(placeholder);return;
  }
  const old=previews.get(target)||{source:'',lines:[],math:[]},change=changeRange(old.source,source),used=new Set(),nextMath=[];
  const formula=token=>{
    const color=token.color||mathColors.find(mark=>mark.from===token.from&&mark.to===token.to)?.color;
    const candidates=old.math.filter(item=>!used.has(item)&&item.latex===token.latex&&item.displayMode===token.displayMode);
    const match=candidates.find(item=>{
      const mapped=item.to<=change.start?item.from:item.from>=change.oldEnd?item.from+change.delta:null;
      return mapped===token.from;
    })||candidates.find(item=>item.from<change.oldEnd&&item.to>change.start);
    if(match)used.add(match);
    const wrapper=match?.element||el(token.displayMode?'div':'span',token.displayMode?'formula-block':'inline-formula');
    wrapper.className=(token.displayMode?'formula-block':'inline-formula')+(color?' text-color-'+color:'');
    wrapper.dataset.from=String(token.from);wrapper.dataset.to=String(token.to);wrapper.dataset.latex=token.latex;
    if(!match){
      wrapper.dataset.mathId=String(nextMathId++);wrapper.tabIndex=0;wrapper.setAttribute('role','button');
      wrapper.setAttribute('aria-label','选择公式以设置颜色');
      try{window.katex.render(visibleMathSpaces(token.latex),wrapper,{displayMode:token.displayMode,throwOnError:true,trust:false,strict:'ignore'});}
      catch(error){const message=el('code','formula-error');message.textContent=error.message||'公式暂时无法解析。';wrapper.replaceChildren(message);}
    }
    nextMath.push({...token,element:wrapper});return wrapper;
  };
  const lines=[];let children=[];
  const flush=force=>{
    if(!force&&!children.length)return;
    const index=lines.length,holder=old.lines[index]?.type==='line'?old.lines[index].element:el('div','preview-line');
    reconcile(holder,children);lines.push({type:'line',element:holder});children=[];
  };
  for(const token of tokenizeLatex(source)){
    if(token.type==='lineBreak'){flush(true);continue;}
    if(token.type==='text'){children.push(...textParts(token,marks));continue;}
    if(token.displayMode){flush(false);lines.push({type:'math',element:formula(token)});continue;}
    children.push(formula(token));
  }
  flush(children.length>0||source.endsWith('\n')||source.endsWith('\\\\'));
  reconcile(target,lines.map(line=>line.element));
  previews.set(target,{source,lines,math:nextMath});
}

