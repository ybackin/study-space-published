// Offsets use UTF-16 units, the same coordinate system as CodeMirror selections.
// This scanner never sends prose to MathJax. It recognizes complete environments
// first, then math runs, and leaves everything else as text.
const DISPLAY_ENVIRONMENTS = new Set(['aligned','align','alignat','cases','dcases','matrix','pmatrix','bmatrix','vmatrix','Vmatrix','array','gathered','gather','split','equation','multline']);
const asciiLetter = c => !!c && ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'));
const digit = c => !!c && c >= '0' && c <= '9';
const cjk = c => !!c && /[\u2e80-\u9fff\uf900-\ufaff]/u.test(c);
const mathPunctuation = c => !!c && '_^=+*/<>(),.[]|-'.includes(c);
const whitespace = c => c === ' ' || c === '\t';

function readEnvironment(source, start) {
  if (!source.startsWith('\\begin{', start)) return null;
  let cursor = start + 7;
  while (cursor < source.length && (asciiLetter(source[cursor]) || source[cursor] === '*')) cursor++;
  if (source[cursor] !== '}' || cursor === start + 7) return null;
  const name = source.slice(start + 7, cursor);
  const open = `\\begin{${name}}`, close = `\\end{${name}}`;
  let depth = 1;
  cursor++;
  while (cursor < source.length) {
    if (source.startsWith(open, cursor)) { depth++; cursor += open.length; continue; }
    if (source.startsWith(close, cursor)) {
      depth--; cursor += close.length;
      if (depth === 0) return {to:cursor, displayMode:DISPLAY_ENVIRONMENTS.has(name.replace(/\*$/, ''))};
      continue;
    }
    cursor++;
  }
  return null;
}

function readRun(source, start) {
  if (!(source[start] === '\\' && asciiLetter(source[start + 1])) &&
      !asciiLetter(source[start]) && !digit(source[start])) return start;
  let cursor = start, curly = 0, square = 0;
  let sawMath = source[start] === '\\', sawCommand = false;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\n' || char === '\r' || cjk(char)) break;
    if (source.startsWith('\\\\', cursor)) break;
    if (char === '\\') {
      if (!asciiLetter(source[cursor + 1])) {
        if (',;:! {}%$&#_^'.includes(source[cursor + 1] || '\0')) {cursor += 2; continue;}
        break;
      }
      cursor += 2;
      while (asciiLetter(source[cursor])) cursor++;
      sawCommand = sawMath = true;
      continue;
    }
    if (char === '{') { curly++; cursor++; continue; }
    if (char === '}') { if (curly === 0) break; curly--; cursor++; continue; }
    if (char === '[') { square++; cursor++; continue; }
    if (char === ']') { if (square === 0) break; square--; cursor++; continue; }
    if (whitespace(char)) {
      if (curly || square) { cursor++; continue; }
      let next = cursor;
      while (whitespace(source[next])) next++;
      const left = source[cursor - 1], right = source[next];
      // Spaces within an expression remain math only when another mathematical
      // term/operator follows. Before prose they stay ordinary text.
      const followsMath = right === '\\' && asciiLetter(source[next + 1]) ||
        mathPunctuation(right) ||
        sawCommand && (asciiLetter(right) || digit(right)) &&
          (source.slice(start, cursor).includes('\\int') || source.slice(start, cursor).includes('\\iint') ||
           mathPunctuation(left) && '=+*/<>-'.includes(left));
      if (followsMath) { cursor = next; continue; }
      break;
    }
    if (asciiLetter(char) || digit(char) || mathPunctuation(char)) {
      if ('_^=<>'.includes(char)) sawMath = true;
      cursor++;
      continue;
    }
    break;
  }
  // A lone English word belongs to prose; a command or expression belongs to math.
  if (!sawMath || cursor === start) return start;
  const tail = source[cursor - 1];
  if (tail && '_^=+/<>-'.includes(tail)) return start;
  if (sawCommand) return cursor;
  // Do not parse a plain word as math merely because it sits beside prose.
  return cursor;
}

export function parseLatexSource(source) {
  const nodes = [];
  let cursor = 0, textStart = 0;
  const flushText = to => {
    if (to > textStart) nodes.push({type:'text', text:source.slice(textStart, to), from:textStart, to});
  };
  while (cursor < source.length) {
    const char = source[cursor];
    const environment = readEnvironment(source, cursor);
    if (environment) {
      flushText(cursor);
      nodes.push({type:'math', latex:source.slice(cursor, environment.to), displayMode:environment.displayMode, from:cursor, to:environment.to});
      cursor = textStart = environment.to;
      continue;
    }
    if (char === '\n' || source.startsWith('\\\\', cursor)) {
      flushText(cursor);
      const to = cursor + (char === '\n' ? 1 : 2);
      nodes.push({type:'lineBreak', from:cursor, to});
      cursor = textStart = to;
      continue;
    }
    if (char === '\\' && !asciiLetter(source[cursor + 1])) {
      // An unfinished command is kept in the source editor, but hidden in preview.
      flushText(cursor);
      cursor = textStart = cursor + 1;
      continue;
    }
    const end = readRun(source, cursor);
    if (end > cursor) {
      flushText(cursor);
      nodes.push({type:'math', latex:source.slice(cursor, end), displayMode:false, from:cursor, to:end});
      cursor = textStart = end;
      continue;
    }
    cursor++;
  }
  flushText(source.length);
  return nodes;
}

export function sourceChange(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length, newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  return {start, oldEnd, newEnd, delta:newEnd - oldEnd};
}

export function shiftColorRanges(ranges, before, after) {
  const {start,oldEnd,newEnd,delta} = sourceChange(before,after);
  return ranges.flatMap(mark => {
    if (mark.to <= start) return [mark];
    if (mark.from >= oldEnd) return [{...mark,from:mark.from+delta,to:mark.to+delta}];
    if (mark.from < start && mark.to > oldEnd) return [{...mark,to:mark.to+delta}];
    if (mark.from < start) return [{...mark,to:start}];
    if (mark.to > oldEnd) return [{...mark,from:newEnd,to:mark.to+delta}];
    return [];
  }).filter(mark => mark.from < mark.to);
}

export function setColorRange(ranges, from, to, color) {
  if (from >= to) return ranges;
  const result = ranges.flatMap(mark => {
    if (mark.to <= from || mark.from >= to) return [mark];
    const pieces = [];
    if (mark.from < from) pieces.push({...mark,to:from});
    if (mark.to > to) pieces.push({...mark,from:to});
    return pieces;
  });
  if (color !== 'default') result.push({from,to,color});
  return result.sort((a,b) => a.from-b.from);
}
