/** Tiny progress ring used as the project completion indicator. */
export default function Ring({ done, total, size = 22, color }: {
  done: number
  total: number
  size?: number
  color: string
}) {
  const pct = total === 0 ? 0 : done / total
  const r = (size - 5) / 2
  const c = 2 * Math.PI * r
  const complete = total > 0 && done === total
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      role="img" aria-label={`${done} of ${total} tasks done`}>
      <title>{done}/{total} tasks done</title>
      <circle className="ring-bg" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={2.5} />
      <circle
        className="ring-fg"
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={2.5} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {complete
        ? <text x="50%" y="54%" textAnchor="middle" dominantBaseline="middle" style={{ fill: color }}>✓</text>
        : total > 0 && <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle">{total - done}</text>}
    </svg>
  )
}
