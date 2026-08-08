const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
const authRoutes = require('./routes/auth');
const departmentRoutes = require('./routes/departments');
const programRoutes = require('./routes/programs');
const facultyRoutes = require('./routes/faculty');
const studentRoutes = require('./routes/students');
const courseRoutes = require('./routes/courses');
const enrollmentRoutes = require('./routes/enrollments');
const examRoutes = require('./routes/exams');
const scholarshipRoutes = require('./routes/scholarships');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
const studentAuthRoutes = require('./routes/studentAuth');
const studentRegistrationRoutes = require('./routes/studentRegistration');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/scholarships', scholarshipRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/student-auth', studentAuthRoutes);
app.use('/api/student-registration', studentRegistrationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'EduBase API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!', message: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 EduBase API Server running on port ${PORT}`);
  console.log(`   Local: http://localhost:${PORT}/api/health`);
});