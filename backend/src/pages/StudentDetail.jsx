import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api'

const StudentDetail = () => {
  const { id } = useParams()
  const [student, setStudent] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [payments, setPayments] = useState([])
  const [scholarships, setScholarships] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    try {
      const [studentRes, enrollRes, payRes, schRes] = await Promise.all([
        api.get(`/students/${id}`),
        api.get(`/students/${id}/enrollments`),
        api.get(`/students/${id}/payments`),
        api.get(`/students/${id}/scholarships`)
      ])
      setStudent(studentRes.data)
      setEnrollments(enrollRes.data)
      setPayments(payRes.data)
      setScholarships(schRes.data)
    } catch (err) {
      console.error('Failed to load student:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="spinner"></div>
  if (!student) return <div>Student not found</div>

  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0)
  const totalScholarship = scholarships.reduce((sum, s) => sum + parseFloat(s.amount), 0)

  return (
    <div>
      <Link to="/students" className="btn btn-secondary" style={{ marginBottom: '1rem' }}>← Back to Students</Link>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{student.full_name}</h2>
          <span className={`badge badge-${student.current_status === 'active' ? 'success' : 'danger'}`}>
            {student.current_status}
          </span>
        </div>

        <div className="form-row">
          <div><strong>Registration No:</strong> {student.registration_no}</div>
          <div><strong>Email:</strong> {student.email}</div>
          <div><strong>Phone:</strong> {student.phone || 'N/A'}</div>
        </div>
        <div className="form-row">
          <div><strong>Program:</strong> {student.program_name} ({student.degree_level})</div>
          <div><strong>Advisor:</strong> {student.advisor_name || 'Not assigned'}</div>
          <div><strong>CGPA:</strong> {parseFloat(student.current_cgpa).toFixed(2)}</div>
        </div>
        <div className="form-row">
          <div><strong>Date of Birth:</strong> {student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString() : 'N/A'}</div>
          <div><strong>Admission Date:</strong> {new Date(student.admission_date).toLocaleDateString()}</div>
          <div><strong>Verified By:</strong> {student.verified_by_name || 'System'}</div>
        </div>
      </div>

      <div className="form-row">
        <div className="card">
          <h3 className="card-title">Enrollments ({enrollments.length})</h3>
          {enrollments.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Year/Term</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map(e => (
                    <tr key={e.enrollment_id}>
                      <td>{e.course_code} - {e.course_title}</td>
                      <td>{e.academic_year} / {e.term}</td>
                      <td><span className={`badge badge-${e.status === 'enrolled' ? 'success' : 'secondary'}`}>{e.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty-state">No enrollments</p>}
        </div>

        <div className="card">
          <h3 className="card-title">Financial Summary</h3>
          <div style={{ marginBottom: '1rem' }}>
            <div className="stat-label">Total Payments</div>
            <div className="stat-value" style={{ color: '#10b981' }}>৳{totalPaid.toLocaleString()}</div>
          </div>
          <div>
            <div className="stat-label">Total Scholarships</div>
            <div className="stat-value" style={{ color: '#f59e0b' }}>৳{totalScholarship.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="form-row">
        <div className="card">
          <h3 className="card-title">Recent Payments</h3>
          {payments.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.slice(0, 5).map(p => (
                    <tr key={p.payment_id}>
                      <td>{p.payment_type}</td>
                      <td>৳{parseFloat(p.amount).toLocaleString()}</td>
                      <td>{new Date(p.paid_on).toLocaleDateString()}</td>
                      <td><span className={`badge badge-${p.status === 'paid' ? 'success' : 'warning'}`}>{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty-state">No payments</p>}
        </div>

        <div className="card">
          <h3 className="card-title">Scholarships</h3>
          {scholarships.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scholarships.map(s => (
                    <tr key={s.scholarship_id}>
                      <td>{s.scholarship_name}</td>
                      <td>৳{parseFloat(s.amount).toLocaleString()}</td>
                      <td><span className={`badge badge-${s.status === 'active' ? 'success' : 'secondary'}`}>{s.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty-state">No scholarships</p>}
        </div>
      </div>
    </div>
  )
}

export default StudentDetail
