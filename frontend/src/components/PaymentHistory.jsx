import { useState } from 'react'

const money = value =>
  `৳${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`

export default function PaymentHistory({
  payments,
  showStudent = false
}) {
  const [kind, setKind] = useState('course_demo')
  const [search, setSearch] = useState('')

  const coursePayments = payments.filter(
    payment => payment.record_type === 'course_demo'
  )

  const visible = payments
    .filter(
      payment =>
        (payment.record_type || 'legacy') === kind
    )
    .filter(payment =>
      [
        payment.student_name,
        payment.registration_no,
        payment.course_code,
        payment.course_title,
        payment.receipt_no,
        payment.academic_year
      ].some(value =>
        String(value || '')
          .toLowerCase()
          .includes(search.toLowerCase().trim())
      )
    )

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">
            {coursePayments.length}
          </div>

          <div className="stat-label">
            Course receipts
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-value">
            {money(
              coursePayments.reduce(
                (sum, payment) =>
                  sum + Number(payment.amount),
                0
              )
            )}
          </div>

          <div className="stat-label">
            Total course fees
          </div>
        </div>
      </div>

      <div className="card">
        <div className="form-row">
          <label className="form-group">
            Payment records

            <select
              className="form-select"
              aria-label="Payment record type"
              value={kind}
              onChange={event =>
                setKind(event.target.value)
              }
            >
              <option value="course_demo">
                Course fees
              </option>

              <option value="legacy">
                Historical payments
              </option>
            </select>
          </label>

          <label className="form-group">
            Search

            <input
              className="form-input"
              aria-label="Search payments"
              placeholder="Name, registration, course or receipt…"
              value={search}
              onChange={event =>
                setSearch(event.target.value)
              }
            />
          </label>
        </div>

        {kind === 'legacy' && (
          <p>
            These older records were preserved. Their original
            data does not identify an individual course; they
            are not treated as payments for new course approvals.
          </p>
        )}

        <div className="table-container">
          <table>
            <thead>
              <tr>
                {showStudent && (
                  <>
                    <th>Student</th>
                    <th>Registration</th>
                  </>
                )}

                <th>Course / payment</th>
                <th>Year / term</th>
                <th>Amount</th>
                <th>Paid on</th>
                <th>Status</th>
                <th>Receipt</th>
              </tr>
            </thead>

            <tbody>
              {visible.map(payment => (
                <tr
                  key={
                    payment.record_key ||
                    `legacy:${payment.payment_id}`
                  }
                >
                  {showStudent && (
                    <>
                      <td>{payment.student_name}</td>
                      <td>{payment.registration_no}</td>
                    </>
                  )}

                  <td>
                    {payment.record_type === 'course_demo' ? (
                      <>
                        {payment.course_code}
                        <br />
                        <small>{payment.course_title}</small>
                      </>
                    ) : (
                      <>
                        {payment.payment_type}
                        <br />
                        <small>
                          Course not recorded in legacy data
                        </small>
                      </>
                    )}
                  </td>

                  <td>
                    {payment.academic_year}
                    {' / '}
                    {payment.term}
                  </td>

                  <td>{money(payment.amount)}</td>

                  <td>
                    {payment.paid_on
                      ? new Date(
                          payment.paid_on
                        ).toLocaleString()
                      : '—'}
                  </td>

                  <td>
                    {payment.status}
                  </td>

                  <td style={{
                    overflowWrap: 'anywhere',
                    maxWidth: 220
                  }}>
                    {payment.receipt_no || 'Legacy record'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!visible.length && (
          <p className="empty-state">
            No payment records found.
          </p>
        )}
      </div>
    </div>
  )
}