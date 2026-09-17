const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap,
  id,
  text,
  check
} = require('../lib/common');

const {
  listPayments,
  coursePaymentSQL
} = require('../lib/courseFees');

router.use(auth, auth.requireAdmin);

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');

  if (!['GET', 'HEAD'].includes(req.method)) {
    return res.status(403).json({
      error:
        'Administrators can only view payments. Course payments must be made by the student.'
    });
  }

  next();
});

router.get('/', wrap(async (req, res) => {
  res.json(
    await listPayments(pool, {
      studentId: id(
        req.query.student_id,
        'student',
        true
      ),

      year: text(
        req.query.academic_year,
        'academic year',
        20,
        false
      ),

      term: text(
        req.query.term,
        'term',
        20,
        false
      ),

      status: text(
        req.query.status,
        'status',
        20,
        false
      )
    })
  );
}));

router.get('/summary/total', wrap(async (req, res) => {
  const [legacy, demo] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total_payments,
        COALESCE(SUM(amount),0) AS total_amount,
        COALESCE(AVG(amount),0) AS average_amount
      FROM payment
      WHERE status='paid'
    `),

    pool.query(`
      SELECT
        COUNT(*)::int AS course_payments,
        COALESCE(SUM(amount),0) AS demo_course_total
      FROM course_payment
    `)
  ]);

  res.json({
    ...legacy.rows[0],
    ...demo.rows[0]
  });
}));

router.get('/course/:id', wrap(async (req, res) => {
  const result = await pool.query(`
    ${coursePaymentSQL}
    WHERE cp.course_payment_id=$1
  `, [id(req.params.id)]);

  check(
    result.rowCount,
    'Payment not found',
    404
  );

  res.json(result.rows[0]);
}));

// Preserve access to old identifiers for historical payment records.
router.get('/:id', wrap(async (req, res) => {
  const result = await pool.query(`
    SELECT
      p.*,
      s.registration_no,
      s.full_name AS student_name

    FROM payment p

    JOIN student s
      ON s.student_id=p.student_id

    WHERE p.payment_id=$1
  `, [id(req.params.id)]);

  check(
    result.rowCount,
    'Historical payment not found',
    404
  );

  res.json(result.rows[0]);
}));

module.exports = router;