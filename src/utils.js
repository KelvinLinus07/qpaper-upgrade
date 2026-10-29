export function makeId() {
  return Math.random().toString(36).slice(2, 9)
}

export function makeQuestion() {
  return {
    id:      makeId(),
    type:    'Objective',
    text:    '',
    options: ['', '', '', ''],
    pairs:   [{ left: '', right: '' }],
    image:   null,
  }
}

export function makePair() {
  return { left: '', right: '' }
}

export function makeSection(idx) {
  return {
    id:           makeId(),
    name:         String.fromCharCode(65 + idx),
    title:        '',
    instructions: '',
    marksPerQ:    1,
    questions:    [makeQuestion()],
  }
}
