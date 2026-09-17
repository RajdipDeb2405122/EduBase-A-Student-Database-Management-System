export default function CoursePaymentPanel({
  enrollments,
  enabled,
  onPay,
  busy
}) {
  const pending = enrollments.filter(
    enrollment =>
      enrollment.fee_required &&
      enrollment.status === 'pending_payment'
  )

  return (
    <div
      className="card"
      style={{ marginBottom: '1.5rem' }}
    >
      <h3>Approved courses — Pending Payment</h3>

      <p>
        Approval reserves your course. Pay the ৳1,000
        course fee to complete each enrollment.
      </p>

      {!enabled && (
        <p role="alert">
          Payments are currently unavailable.
        </p>
      )}

      {pending.length ? (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Course</th>
                <th>Year / term</th>
                <th>Fee</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {pending.map(enrollment => (
                <tr key={enrollment.enrollment_id}>
                  <td>
                    {enrollment.course_code}
                    {' — '}
                    {enrollment.course_title}
                  </td>

                  <td>
                    {enrollment.academic_year}
                    {' / '}
                    {enrollment.term}
                  </td>

                  <td>
                    ৳{Number(
                      enrollment.course_fee
                    ).toLocaleString()}
                  </td>

                  <td>
                    <span className="badge badge-warning">
                      Pending Payment
                    </span>
                  </td>

                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!enabled || busy}
                      onClick={() => onPay(enrollment)}
                    >
                      Pay ৳1,000
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No approved courses are awaiting payment.</p>
      )}
    </div>
  )
}