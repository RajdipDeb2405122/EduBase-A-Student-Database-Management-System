const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap,
  check,
  id,
  transaction
} = require('../lib/common');

const {
  FEE_AMOUNT,
  demoEnabled,
  coursePaymentSQL
} = require('../lib/courseFees');

router.use(auth, auth.requireStudent);

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/config', (req, res) => {
  res.json({
    mode: 'demo',
    enabled: demoEnabled(),
    amount: FEE_AMOUNT,
    currency: 'BDT',
    message: 'Demonstration only. No real money is collected.'
  });
});

router.post(
  '/enrollments/:id/pay',
  wrap(async (req, res) => {
    check(
      demoEnabled(),
      'Demo payments are disabled on this server',
      503
    );

    check(
      req.body?.confirm === true &&
        Object.keys(req.body).every(
          key => key === 'confirm'
        ),
      'Confirm the demo payment. Do not send an amount, student ID or payment status.'
    );

    const enrollmentId = id(
      req.params.id,
      'enrollment'
    );

    const result = await transaction(async db => {
      const found = await db.query(`
        SELECT e.*,c.active

        FROM enrollment e

        JOIN course c
          ON c.course_id=e.course_id

        WHERE e.enrollment_id=$1
          AND e.student_id=$2

        FOR UPDATE OF e
        FOR SHARE OF c
      `, [
        enrollmentId,
        req.user.student_id
      ]);

      check(
        found.rowCount,
        'Course approval not found',
        404
      );

      const enrollment = found.rows[0];

      const previous = await db.query(`
        SELECT course_payment_id
        FROM course_payment
        WHERE enrollment_id=$1
      `, [enrollmentId]);

      // A retry returns the existing receipt instead of charging again.
      if (previous.rowCount) {
        const receipt = await db.query(`
          ${coursePaymentSQL}
          WHERE cp.course_payment_id=$1
        `, [previous.rows[0].course_payment_id]);

        return {
          created: false,
          payment: receipt.rows[0]
        };
      }

      check(
        enrollment.fee_required &&
          enrollment.status === 'pending_payment',
        'Only an approved course awaiting payment can be paid',
        409
      );

      check(
        enrollment.active,
        'This course is inactive. Contact the administration before paying.',
        409
      );

      const receiptNo =
        `DEMO-${crypto.randomUUID()}`;

      const payment = await db.query(`
        INSERT INTO course_payment (
          enrollment_id,
          amount,
          currency,
          payment_mode,
          receipt_no
        )
        VALUES (
          $1,
          1000.00,
          'BDT',
          'demo',
          $2
        )
        RETURNING course_payment_id
      `, [
        enrollmentId,
        receiptNo
      ]);

      await db.query(`
        UPDATE enrollment
        SET status='enrolled'
        WHERE enrollment_id=$1
      `, [enrollmentId]);

      // Include a newly paid student in already-created exams
      // for this same course/year/term.
      await db.query(`
        INSERT INTO exam_result (
          exam_id,
          student_id,
          enrollment_id
        )
        SELECT
          x.exam_id,
          e.student_id,
          e.enrollment_id

        FROM enrollment e

        JOIN exam x
          ON x.course_id=e.course_id
         AND x.academic_year=e.academic_year
         AND x.term=e.term

        WHERE e.enrollment_id=$1

        ON CONFLICT(exam_id,student_id)
        DO NOTHING
      `, [enrollmentId]);

      const receipt = await db.query(`
        ${coursePaymentSQL}
        WHERE cp.course_payment_id=$1
      `, [payment.rows[0].course_payment_id]);

      return {
        created: true,
        payment: receipt.rows[0]
      };
    });

    res.status(result.created ? 201 : 200).json({
      message: result.created
        ? 'Demo payment completed. Your enrollment is now confirmed.'
        : 'This course fee has already been paid.',

      demo: true,
      payment: result.payment
    });
  })
);

module.exports = router;