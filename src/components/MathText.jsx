import React, {useMemo} from 'react'
import katex from 'katex'
import {splitMathSegments} from '../lib/math.js'

/** Readable HTML + MathML (for assistive technologies), rendered identically in
 * the on-screen preview and browser's Print -> Save as PDF output. */
export default function MathText({text = '', fillBlanks = false}) {
  const segments = useMemo(() => splitMathSegments(text), [text])
  return <>{segments.map((part, i) => {
    if (part.kind === 'math') {
      try {
        const html = katex.renderToString(part.value, {
          throwOnError: true, displayMode: part.display,
          output: 'htmlAndMathml', trust: false, strict: 'ignore',
          maxExpand: 1000, maxSize: 20
        })
        return <span key={i} className={part.display ? 'paper-math-display' : 'paper-math-inline'} dangerouslySetInnerHTML={{__html: html}} />
      } catch {
        // Never lose original content if an imported formula is invalid.
        return <span key={i} className="paper-math-invalid" title="Invalid LaTeX formula">{part.display ? `\\[${part.value}\\]` : `\\(${part.value}\\)`}</span>
      }
    }
    if (!fillBlanks) return <React.Fragment key={i}>{part.value}</React.Fragment>
    return <React.Fragment key={i}>{part.value.split('___').map((piece, idx, all) => <React.Fragment key={idx}>{piece}{idx < all.length - 1 && <span className="pv-blank" />}</React.Fragment>)}</React.Fragment>
  })}</>
}
