const pool = require('../config/database');

// The only scholarships a student may apply for.
// Names, types and amounts are fixed on the server —
// the client sends only the chosen scholarship_name.
const PREDEFINED_SCHOLARSHIPS = [
  {
    scholarship_name: 'Merit Excellence Scholarship',
    award_type: 'Academic Excellence',
    amount: 50000
  },
  {
    scholarship_name: 'Need-Based Financial Aid',
    award_type: 'Financial Aid',
    amount: 40000
  },
  {
    scholarship_name: 'Sports Achievement Scholarship',
    award_type: 'Sports',
    amount: 35000
  },
  {
    scholarship_name: 'Arts & Culture Scholarship',
    award_type: 'Arts',
    amount: 30000
  },
  {
    scholarship_name: 'Research Grant Scholarship',
    award_type: 'Research',
    amount: 45000
  },
  {
    scholarship_name: "Dean's List Honor Scholarship",
    award_type: 'Academic Excellence',
    amount: 25000
  },
  {
    scholarship_name: 'Community Service Scholarship',
    award_type: 'Other',
    amount: 20000
  },
  {
    scholarship_name: 'First-Generation Student Scholarship',
    award_type: 'Financial Aid',
    amount: 38000
  },
  {
    scholarship_name: 'Women in STEM Scholarship',
    award_type: 'Academic Excellence',
    amount: 42000
  },
  {
    scholarship_name: 'International Student Scholarship',
    award_type: 'Other',
    amount: 48000
  }
];

// Applications live in their own table so the shared base
// schema and migration list do not have to change. The table
// is created lazily on first use and the promise is memoised.
let applicationsTable = null;

function ensureScholarshipTables() {
  if (!applicationsTable) {
    applicationsTable = pool.query(`
      CREATE TABLE IF NOT EXISTS scholarship_application (
        application_id SERIAL PRIMARY KEY,

        student_id INT NOT NULL
          REFERENCES student(student_id)
          ON DELETE CASCADE,

        scholarship_name VARCHAR(100) NOT NULL,

        award_type VARCHAR(50),

        amount DECIMAL(12,2) NOT NULL,

        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected')),

        applied_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        reviewed_by_admin_id INT
          REFERENCES admin(admin_id)
          ON DELETE SET NULL,

        reviewed_on TIMESTAMP,

        CONSTRAINT chk_scholarship_application_amount
          CHECK (amount >= 0)
      )
    `)
      .then(() => pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS
          scholarship_application_pending
        ON scholarship_application (student_id, scholarship_name)
        WHERE status='pending'
      `))
      .catch(error => {
        // Allow a retry after a transient database failure.
        applicationsTable = null;
        throw error;
      });
  }

  return applicationsTable;
}

// Returns the predefined offer only when the name matches
// exactly; anything else (including edited names) is rejected.
function predefinedScholarship(name) {
  const wanted = typeof name === 'string' ? name.trim() : '';

  return (
    PREDEFINED_SCHOLARSHIPS.find(
      item => item.scholarship_name === wanted
    ) || null
  );
}

module.exports = {
  PREDEFINED_SCHOLARSHIPS,
  ensureScholarshipTables,
  predefinedScholarship
};