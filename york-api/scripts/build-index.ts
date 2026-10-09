import { writeFileSync } from 'node:fs'
import {
  COMPONENTS,
  CYCLE_NODES,
  GLOSSARY,
  INFO,
  MAINT_ITEMS,
  PLANT_NODES,
  QUIZ,
  SHUTDOWN_STEPS,
  STARTUP_STEPS,
  TROUBLE_CASES,
} from '../../york-chiller/src/data/content.ts'

interface Chunk {
  id: string
  title: string
  text: string
  href: string
}

const chunks: Chunk[] = []

function add(id: string, title: string, text: string): void {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length < 20) return
  chunks.push({ id, title, text: clean, href: `/york-chiller/#${id}` })
}

function symptomLine(symptom: string): string {
  const text = symptom.trim()
  return /[.!?]$/.test(text) ? text : `${text}.`
}

for (const item of COMPONENTS) {
  add(`trainer:component:${item.id}`, item.name, [item.summary, ...item.details, item.operatorTip].join(' '))
}
for (const item of PLANT_NODES) add(`trainer:plant:${item.id}`, item.label, item.detail)
for (const item of CYCLE_NODES) add(`trainer:cycle:${item.id}`, item.label, `${item.phase} ${item.detail}`)
for (const item of STARTUP_STEPS) add(`trainer:start:${item.id}`, item.title, item.body)
for (const item of SHUTDOWN_STEPS) add(`trainer:stop:${item.id}`, item.title, item.body)
for (const item of QUIZ) add(`trainer:quiz:${item.id}`, item.topic, `${item.prompt} ${item.explain}`)
for (const item of TROUBLE_CASES) {
  const symptoms = item.symptoms.map(symptomLine).join(' ')
  add(`trainer:trouble:${item.id}`, item.title, `Typical symptoms: ${symptoms} ${item.teach}`)
}
for (const item of MAINT_ITEMS) add(`trainer:maint:${item.id}`, item.when, item.text)
for (const [id, entry] of Object.entries(GLOSSARY)) {
  add(`trainer:glossary:${id}`, entry.term, `${entry.definition} ${entry.why ?? ''}`)
}
for (const [id, entry] of Object.entries(INFO)) {
  add(`trainer:info:${id}`, entry.title, entry.points.join(' '))
}

const target = new URL('../data/trainer-index.json', import.meta.url)
writeFileSync(target, JSON.stringify(chunks))
console.log(`Wrote ${chunks.length} trainer chunks`)
