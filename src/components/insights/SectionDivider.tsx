/**
 * The rule that splits the Insights page into its two halves — study analytics
 * above, daily-log analytics below. Deliberately quiet: a small-caps label and a
 * hairline, not a banner, so it separates the halves without competing with the
 * card headings underneath it.
 */
export default function SectionDivider({ label, note }: { label: string; note?: string }) {
  return (
    <div className="ins2-divider" role="separator" aria-label={label}>
      <span className="ins2-divider-label">{label}</span>
      {note && <span className="ins2-divider-note">{note}</span>}
      <span className="ins2-divider-rule" />
    </div>
  )
}
