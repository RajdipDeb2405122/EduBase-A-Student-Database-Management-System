// Single source of truth for marks components and the grading scale.
// Edit here only; everything else (marks entry, publication,
// student results) reads these values.
//
// The component ranges are also enforced by CHECK constraints on
// course_mark (scripts/007_catalog_results.sql) — keep them in step.

const MARK_COMPONENTS = [
  { key: 'attendance', label: 'Attendance', max: 10 },
  { key: 'class_test', label: 'CT', max: 20 },
  { key: 'semester_final', label: 'Semester Final', max: 70 }
];

// Lower bound (inclusive) of the course total, highest band first.
const GRADE_SCALE = [
  { min: 80, letter: 'A+', point: 4.00 },
  { min: 75, letter: 'A', point: 3.75 },
  { min: 70, letter: 'A-', point: 3.50 },
  { min: 65, letter: 'B+', point: 3.25 },
  { min: 60, letter: 'B', point: 3.00 },
  { min: 55, letter: 'B-', point: 2.75 },
  { min: 50, letter: 'C+', point: 2.50 },
  { min: 45, letter: 'C', point: 2.25 },
  { min: 40, letter: 'D', point: 2.00 },
  { min: 0, letter: 'F', point: 0.00 }
];

// Totals are not rounded before grading: 79.5 is in the 75–79 band.
function gradeFor(total) {
  const band = GRADE_SCALE.find(({ min }) => Number(total) >= min);
  return { letter: band.letter, point: band.point };
}

// Credit-weighted average of grade points, rounded to 2 decimals.
// Returns null when there are no credits (nothing completed yet).
function weightedAverage(rows) {
  let credits = 0;
  let points = 0;

  for (const row of rows) {
    credits += Number(row.credit_hours);
    points += Number(row.grade_point) * Number(row.credit_hours);
  }

  return credits > 0
    ? Math.round(points / credits * 100) / 100
    : null;
}

module.exports = {
  MARK_COMPONENTS,
  GRADE_SCALE,
  gradeFor,
  weightedAverage
};
