import {parseLatexSource, sourceChange} from './latex-next-model.js';

const COLOR_VALUES = Object.freeze({
  default:'', red:'#ff7c86', orange:'#ffb46b', yellow:'#f5d779',
  green:'#8fdb9c', cyan:'#83d9e2', blue:'#9fbcff', purple:'#c2a2ff',
  pink:'#f3a3d6', gray:'#a5afbf',
});
export const COLORS = Object.keys(COLOR_VALUES);
export const colorValue = name => COLOR_VALUES[name] || '';
let nextId = 1;

function create(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function reconcile(parent, wanted) {
  const keep = new Set(wanted);
  for (const child of [...parent.childNodes]) if (!keep.has(child)) child.remove();
  wanted.forEach((node,index) => {
    if (parent.childNodes[index] !== node) parent.insertBefore(node, parent.childNodes[index] || null);
  });
}

async function mathJax() {
  if (!window.MathJax?.startup?.promise) await new Promise(resolve => window.addEventListener('load', resolve, {once:true}));
  await window.MathJax.startup.promise;
  if (typeof window.MathJax.tex2svgPromise !== 'function') throw Error('MathJax SVG 尚未就绪');
  return window.MathJax;
}

async function typeset(record) {
  const serial = ++record.serial;
  try {
    const api = await mathJax();
    const output = await api.tex2svgPromise(record.latex, {display:record.displayMode});
    if (serial !== record.serial) return;
    record.element.replaceChildren(output);
    record.element.dataset.renderedLatex = record.latex;
    record.element.dataset.renderCount = String(Number(record.element.dataset.renderCount || 0) + 1);
  } catch (error) {
    if (serial !== record.serial) return;
    const message = create('code','math-error');
    message.textContent = error?.message || '公式暂时无法渲染';
    record.element.replaceChildren(message);
  }
}

function textChildren(token, marks) {
  const cuts = new Set([token.from, token.to]);
  for (const mark of marks) {
    if (mark.from > token.from && mark.from < token.to) cuts.add(mark.from);
    if (mark.to > token.from && mark.to < token.to) cuts.add(mark.to);
  }
  const bounds = [...cuts].sort((a,b) => a-b), parts = [];
  for (let i=1;i<bounds.length;i++) {
    const from = bounds[i-1], to = bounds[i];
    if (from === to) continue;
    const color = marks.find(mark => mark.from <= from && mark.to >= to)?.color || 'default';
    const span = create('span','note-text');
    span.textContent = token.text.slice(from-token.from,to-token.from);
    if (colorValue(color)) span.style.color = colorValue(color);
    parts.push(span);
  }
  return parts;
}

export function createMathPreview(host, {onMathClick=()=>{}}={}) {
  let previous = {source:'',lines:[],math:[]};
  host.addEventListener('click', event => {
    const element = event.target.closest('.math-node');
    if (element && host.contains(element)) onMathClick({id:element.dataset.mathId, from:Number(element.dataset.from), to:Number(element.dataset.to), element});
  });

  function render(note) {
    const source = note.source || '';
    const marks = note.marks || [], mathColors = note.mathColors || [];
    const change = sourceChange(previous.source, source), used = new Set(), math = [], lines = [];
    let children = [];
    const flush = force => {
      if (!force && !children.length) return;
      const index = lines.length;
      const holder = previous.lines[index]?.kind === 'line' ? previous.lines[index].element : create('p','note-line');
      if (!children.length) children.push(document.createElement('br'));
      reconcile(holder, children);
      lines.push({kind:'line',element:holder});
      children = [];
    };
    const formula = token => {
      const matches = previous.math.filter(item => !used.has(item) && item.latex === token.latex && item.displayMode === token.displayMode);
      const old = matches.find(item => {
        const mapped = item.to <= change.start ? item.from : item.from >= change.oldEnd ? item.from + change.delta : null;
        return mapped === token.from;
      }) || matches.find(item => item.from < change.oldEnd && item.to > change.start);
      if (old) used.add(old);
      const record = old || {id:String(nextId++), serial:0, element:create(token.displayMode?'div':'span', token.displayMode?'math-node math-display':'math-node math-inline')};
      record.latex = token.latex;
      record.displayMode = token.displayMode;
      record.from = token.from; record.to = token.to;
      record.element.dataset.mathId = record.id;
      record.element.dataset.from = String(token.from);
      record.element.dataset.to = String(token.to);
      record.element.dataset.latex = token.latex;
      record.element.tabIndex = 0;
      record.element.setAttribute('role','button');
      record.element.setAttribute('aria-label',`选择公式 ${token.latex}`);
      const color = mathColors.find(item => item.from === token.from && item.to === token.to)?.color || 'default';
      record.element.dataset.color = color;
      record.element.style.color = colorValue(color);
      if (!old) typeset(record);
      math.push(record);
      return record.element;
    };
    if (!source) {
      const hint = create('p','note-placeholder');
      hint.textContent = '预览会在这里即时显示。';
      reconcile(host,[hint]);
      previous = {source,lines:[],math:[]};
      return [];
    }
    for (const token of parseLatexSource(source)) {
      if (token.type === 'lineBreak') {flush(true); continue;}
      if (token.type === 'text') {children.push(...textChildren(token, marks)); continue;}
      if (token.displayMode) {flush(false);lines.push({kind:'math',element:formula(token)});continue;}
      children.push(formula(token));
    }
    flush(children.length > 0 || source.endsWith('\n') || source.endsWith('\\\\'));
    reconcile(host,lines.map(line => line.element));
    previous = {source,lines,math};
    return math.map(({id,latex,displayMode,from,to,element}) => ({id,latex,displayMode,from,to,element}));
  }
  return {render, getMath:()=>previous.math.map(item=>({...item}))};
}
