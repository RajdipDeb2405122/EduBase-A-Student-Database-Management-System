import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'

import api from '../api'
import useLiveUpdates from '../hooks/useLiveUpdates'
import PaymentHistory from '../components/PaymentHistory'

export default function Payments() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const version = useRef(0)

  const load = useCallback(async () => {
    const current = ++version.current

    try {
      const { data } = await api.get(
        '/payments',
        { role: 'admin' }
      )

      if (current === version.current) {
        setPayments(data)
        setError('')
      }
    } catch (error) {
      if (current === version.current) {
        setError(error.message)
      }
    } finally {
      if (current === version.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useLiveUpdates(load)

  if (loading) {
    return <div className="spinner" />
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          Payments — View Only
        </h1>

        <button
          className="btn btn-secondary"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      <p>
        All admin categories can view who paid, the amount,
        the course and the receipt. Payments can only be
        submitted by students.
      </p>

      {error && (
        <p role="alert" className="badge badge-danger">
          {error}
        </p>
      )}

      <PaymentHistory
        payments={payments}
        showStudent
      />
    </div>
  )
}