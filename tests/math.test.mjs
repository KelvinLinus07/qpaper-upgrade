import test from 'node:test'
import assert from 'node:assert/strict'
import {splitMathSegments, insertAtSelection} from '../src/lib/math.js'

test('keeps ordinary questions unchanged', () => {
 assert.deepEqual(splitMathSegments('What is 2 + 3?'), [{kind:'text',value:'What is 2 + 3?'}])
})
test('parses inline and display LaTeX without swallowing neighbouring text', () => {
 assert.deepEqual(splitMathSegments('Find \\(x^2\\) and \\[\\frac{1}{2}\\] now'),[
 {kind:'text',value:'Find '},{kind:'math',value:'x^2',display:false},
 {kind:'text',value:' and '},{kind:'math',value:'\\frac{1}{2}',display:true},
 {kind:'text',value:' now'}])
})
test('supports traditional dollar-delimiters in imported files',()=>{
 assert.deepEqual(splitMathSegments('Solve $x=2$ then $$y=x^2$$'),[
 {kind:'text',value:'Solve '},{kind:'math',value:'x=2',display:false},
 {kind:'text',value:' then '},{kind:'math',value:'y=x^2',display:true}])
})
test('inserts at caret rather than appending',()=>{
 assert.deepEqual(insertAtSelection('Solve  now',6,6,'x^2'),{text:'Solve \\(x^2\\) now',caret:13})
})
test('replaces selected text and supports display mode',()=>{
 assert.deepEqual(insertAtSelection('Solve something',6,15,'\\frac{a}{b}',true),{text:'Solve \\[\\frac{a}{b}\\]',caret:21})
})
test('empty input remains empty text segment',()=>{
 assert.deepEqual(splitMathSegments(''),[{kind:'text',value:''}])
})
