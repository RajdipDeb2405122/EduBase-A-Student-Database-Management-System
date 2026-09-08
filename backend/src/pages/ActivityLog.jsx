import { useState, useEffect } from 'react'
import api from '../api'

const ActivityLog = () => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    try {
      const { data } = await api.get('/admin/logs/recent?limit=100')
      setLogs(data)
    } catch (err) {
      console.error('Failed to load logs:', err)
    } finally {
      setLoading(false)
    }
  }

  const getActionBadge = (action) => {
    const badges = {
      'CREATE': 'badge-success',
      'UPDATE': 'badge-info',
      'DELETE': 'badge-danger',
      'AUTHORIZE': 'badge-warning',
      'VERIFY': 'badge-info',
      'RESET': 'badge-secondary'
    }
    return badges[action] || 'badge-secondary'
  }

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Activity Log</h1>
        <button className="btn btn-secondary" onClick={loadLogs}>🔄 Refresh</button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Table</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.log_id}>
                  <td>{new Date(log.action_timestamp).toLocaleString()}</td>
                  <td>{log.admin_name || log.username || 'System'}</td>
                  <td>
                    <span className={`badge ${getActionBadge(log.action_type)}`}>
                      {log.action_type}
                    </span>
                  </td>
                  <td>{log.target_table}</td>
                  <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.new_value || log.old_value || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length === 0 && <div className="empty-state">No activity logs found</div>}
      </div>
    </div>
  )
}

export default ActivityLog
