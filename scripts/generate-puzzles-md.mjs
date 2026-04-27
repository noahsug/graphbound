#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_JSON_PATH = path.join(ROOT_DIR, 'puzzles.json')
const DEFAULT_MARKDOWN_PATH = path.join(ROOT_DIR, 'PUZZLES.md')

function parseArgs(args) {
  const options = {
    input: DEFAULT_JSON_PATH,
    output: DEFAULT_MARKDOWN_PATH,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    if (arg === '--input') {
      const input = args[index + 1]
      if (!input) {
        throw new Error('--input needs a path')
      }
      options.input = path.resolve(process.cwd(), input)
      index += 1
      continue
    }

    if (arg === '--output') {
      const output = args[index + 1]
      if (!output) {
        throw new Error('--output needs a path')
      }
      options.output = path.resolve(process.cwd(), output)
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function printUsage() {
  console.log(`Usage: node scripts/generate-puzzles-md.mjs [--input puzzles.json] [--output PUZZLES.md]

Generates the human-readable puzzle progression table from puzzles.json.`)
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value)
}

function markdownCell(value) {
  return String(value).replace(/\|/g, '\\|')
}

function axisText(axis) {
  return `${formatNumber(axis.min)} to ${formatNumber(axis.max)}`
}

function targetText(target) {
  return `(${formatNumber(target.x)}, ${formatNumber(target.y)})`
}

function normalizeRow(row, index) {
  const id = requiredString(row.id, `rows[${index}].id`)

  return {
    id,
    name: requiredString(row.name, `${id}.name`),
    equation: requiredString(row.equation, `${id}.equation`),
    intendedSolution: requiredString(row.intendedSolution, `${id}.intendedSolution`),
    unlocksPuzzle: optionalString(row.unlocksPuzzle, 'none'),
    unlocksTile: optionalString(row.unlocksTile, 'none'),
    axes: {
      x: normalizeAxis(row.axes?.x, `${id}.axes.x`),
      y: normalizeAxis(row.axes?.y, `${id}.axes.y`),
    },
    target: normalizeTarget(row.target, `${id}.target`),
  }
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`)
  }

  return value
}

function optionalString(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  if (typeof value !== 'string') {
    throw new Error(`Expected ${fallback} field to be a string`)
  }

  return value
}

function normalizeAxis(axis, label) {
  if (!axis || typeof axis !== 'object') {
    throw new Error(`${label} must be an object`)
  }

  return {
    min: finiteNumber(axis.min, `${label}.min`),
    max: finiteNumber(axis.max, `${label}.max`),
  }
}

function normalizeTarget(target, label) {
  if (!target || typeof target !== 'object') {
    throw new Error(`${label} must be an object`)
  }

  return {
    x: finiteNumber(target.x, `${label}.x`),
    y: finiteNumber(target.y, `${label}.y`),
  }
}

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }

  return value
}

function generateMarkdown(rows) {
  const lines = [
    '# Graphbound Puzzle Progression Draft',
    '',
    'This file is generated from `puzzles.json`. Run `npm run generate-puzzles` after editing puzzle data.',
    '',
    'Authoring requirements live in `REQUIREMENTS.md`.',
    '',
    '| # | puzzle name | equation | solution | unlocks puzzle | unlocks tile | x-axis | y-axis | target coordinate |',
    '|---|---|---|---|---|---|---|---|---|',
  ]

  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.name,
        row.equation,
        row.intendedSolution,
        row.unlocksPuzzle,
        row.unlocksTile,
        axisText(row.axes.x),
        axisText(row.axes.y),
        targetText(row.target),
      ]
        .map(markdownCell)
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    )
  }

  lines.push('')
  return lines.join('\n')
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const data = JSON.parse(readFileSync(options.input, 'utf8'))
  const rows = (Array.isArray(data) ? data : data.rows).map(normalizeRow)
  const markdown = generateMarkdown(rows)
  writeFileSync(options.output, markdown)
  console.log(`Generated ${path.relative(process.cwd(), options.output)} from ${path.relative(process.cwd(), options.input)} (${rows.length} rows).`)
}

main()
