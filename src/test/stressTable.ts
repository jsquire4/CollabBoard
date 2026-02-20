/**
 * Console table output for stress tests.
 * Prints a bordered ASCII table with metric name, value, and pass/fail status.
 */

export interface StressMetric {
  name: string
  value: string
  pass: boolean
}

export function printStressTable(title: string, metrics: StressMetric[]): void {
  const nameW = Math.max(24, ...metrics.map(m => m.name.length + 2))
  const valW = Math.max(12, ...metrics.map(m => m.value.length + 2))
  const statW = 10

  const hr = `├${'─'.repeat(nameW)}┼${'─'.repeat(valW)}┼${'─'.repeat(statW)}┤`
  const top = `┌${'─'.repeat(nameW)}┬${'─'.repeat(valW)}┬${'─'.repeat(statW)}┐`
  const bot = `└${'─'.repeat(nameW)}┴${'─'.repeat(valW)}┴${'─'.repeat(statW)}┘`

  const pad = (s: string, w: number) => ` ${s}${' '.repeat(Math.max(0, w - s.length - 1))}`

  console.log('')
  console.log(`  ${title}`)
  console.log(top)
  console.log(`│${pad('Metric', nameW)}│${pad('Value', valW)}│${pad('Status', statW)}│`)
  console.log(hr)
  for (const m of metrics) {
    const status = m.pass ? '✓ PASS' : '✗ FAIL'
    console.log(`│${pad(m.name, nameW)}│${pad(m.value, valW)}│${pad(status, statW)}│`)
  }
  console.log(bot)
  console.log('')
}
