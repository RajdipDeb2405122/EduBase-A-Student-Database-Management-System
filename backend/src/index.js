require('dotenv').config();

const express = require('express');
const cors = require('cors');
const auth = require('./middleware/auth');
const { errors } = require('./lib/common');
const live = require('./lib/live');

const app = express();

app.use(cors());

// Ordinary JSON requests remain small.
// Profile-photo uploads use their own bounded raw-body parser.
app.use(express.json({ limit: '64kb' }));

app.use(live.notifyChanges);

app.get('/api/live', auth, live.stream);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'EduBase API is running'
  });
});

app.use('/api/auth', require('./routes/auth'));

app.use('/api/profile', require('./routes/profile'));

app.use(
  '/api/student-auth',
  require('./routes/studentAuth')
);

app.use(
  '/api/faculty-auth',
  require('./routes/facultyAuth')
);

app.use(
  '/api/student-registration',
  require('./routes/studentRegistration')
);

app.use(
  '/api/faculty-registration',
  require('./routes/facultyRegistration')
);

app.use(
  '/api/faculty-portal',
  require('./routes/facultyPortal')
);

app.use(
  '/api/course-registration',
  require('./routes/courseRegistration')
);

const catalogueAccess = (req, res, next) => {
  if (['GET', 'HEAD'].includes(req.method)) {
    return next();
  }

  auth(req, res, error => {
    if (error) return next(error);
    auth.requireAdmin(req, res, next);
  });
};

app.use(
  '/api/departments',
  catalogueAccess,
  require('./routes/departments')
);

app.use(
  '/api/programs',
  catalogueAccess,
  require('./routes/programs')
);

for (const [url, file] of Object.entries({
  admin: 'admin',
  students: 'students',
  faculty: 'faculty',
  courses: 'courses',
  enrollments: 'enrollments',
  exams: 'exams',
  payments: 'payments',
  scholarships: 'scholarships',
  dashboard: 'dashboard'
})) {
  app.use(
    `/api/${url}`,
    auth,
    auth.requireAdmin,
    require(`./routes/${file}`)
  );
}

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found'
  });
});

app.use(errors);

if (require.main === module) {
  app.listen(
    process.env.PORT || 5000,
    '0.0.0.0',
    () => console.log('EduBase API started')
  );
}

module.exports = app;