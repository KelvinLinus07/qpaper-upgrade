/**
 * Math is stored as ordinary text. Supported delimiters are \(...\), \[...\],
 * $...$ and $$...$$. This preserves existing APIs, JSON/CSV imports, the
 * question bank, templates, autosave and historical paper revisions.
 */
export function splitMathSegments(value) {
  const input = String(value ?? '')
  const segments = []
  const pattern = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^\n$]+\$)/g
  let last = 0
  let match
  while ((match = pattern.exec(input))) {
    if (match.index > last) segments.push({ kind: 'text', value: input.slice(last, match.index) })
    const wrapped = match[0]
    const display = wrapped.startsWith('\\[') || wrapped.startsWith('$$')
    const offset = wrapped.startsWith('\\') ? 2 : display ? 2 : 1
    segments.push({kind: 'math', value: wrapped.slice(offset, -offset), display})
    last = pattern.lastIndex
  }
  if (last < input.length) segments.push({kind: 'text', value: input.slice(last)})
  return segments.length ? segments : [{kind: 'text', value: ''}]
}
export function insertAtSelection(value, start, end, latex, display = false) {
  const source = String(value ?? '')
  const from = Math.max(0, Math.min(source.length, Number(start) || 0))
  const to = Math.max(from, Math.min(source.length, Number(end) || from))
  const formula = display ? `\\[${latex}\\]` : `\\(${latex}\\)`
  return {text: source.slice(0, from) + formula + source.slice(to), caret: from + formula.length}
}
