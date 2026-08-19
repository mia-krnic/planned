import { fmtTime, hmToMin, minToHm } from '../utils/date'

/**
 * Time dropdown in 15-minute steps. Unlike the native time input's spinner it
 * is a plain list: scrolling stops at 11:45pm instead of wrapping to 12:00am.
 * A value that isn't on the 15-minute grid (e.g. 9:05) is kept as an extra option.
 */
export default function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options: string[] = []
  for (let m = 0; m < 24 * 60; m += 15) options.push(minToHm(m))
  if (!options.includes(value)) {
    options.push(value)
    options.sort()
  }
  return (
    <select className="time-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((v) => (
        <option key={v} value={v}>{fmtTime(hmToMin(v))}</option>
      ))}
    </select>
  )
}
