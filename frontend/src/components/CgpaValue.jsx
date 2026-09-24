// CGPA is null until a student has a published term. That must not
// read as 0.00, which is a real (failing) CGPA.
export const formatCgpa = value =>
  value === null || value === undefined || value === ''
    ? '—'
    : Number(value).toFixed(2)

export default function CgpaValue({ value, note = true }) {
  const missing = value === null || value === undefined || value === ''

  if (!missing) {
    return <span>{formatCgpa(value)}</span>
  }

  return (
    <span title="No completed term yet">
      —
      {note && (
        <small style={{ marginLeft: 6, color: 'var(--text-secondary)' }}>
          No completed term yet
        </small>
      )}
    </span>
  )
}
