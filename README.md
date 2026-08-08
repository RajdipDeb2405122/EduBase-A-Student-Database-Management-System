# EduBase - Student Database Management System

A simple and efficient student database system built for CSE graduate teachers. This project follows the original planned stack:

- **Frontend**: React
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL

## Project Structure

```
project/
├── frontend/           # React application
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── context/       # React contexts (Auth)
│   │   ├── pages/        # Page components
│   │   ├── api/          # API configuration
│   │   └── styles/       # CSS styles
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── backend/            # Express.js API
│   ├── src/
│   │   ├── routes/       # API routes
│   │   ├── middleware/    # Auth middleware
│   │   ├── config/       # Database config
│   │   └── scripts/      # DB init & seed
│   ├── package.json
│   └── .env
│
└── README.md
```

## Database Schema (11 Entities)

Based on the Student Database ERD with Administrative Authority Layer:

1. **DEPARTMENT** - Academic departments
2. **PROGRAM** - Programs offered by departments
3. **FACULTY** - Faculty members
4. **ADMIN** - Admin users for authentication
5. **COURSE** - Courses offered in programs
6. **STUDENT** - Core student entity
7. **SCHOLARSHIP** - Student scholarships
8. **ADMIN_ACTION_LOG** - Audit trail for admin actions
9. **ENROLLMENT** - Student-course enrollment bridge
10. **EXAM** - Exam records tied to enrollment
11. **PAYMENT** - Student payments

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)

## Setup Instructions

### 1. Database Setup

First, make sure PostgreSQL is running and create a database:

```bash
# Create database (if not exists)
psql -U postgres -c "CREATE DATABASE edubase;"
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment (edit .env if needed)
# Default: DB_HOST=localhost, DB_PORT=5432, DB_NAME=edubase
# Default credentials: postgres/postgres

# Initialize database schema
npm run db:init

# Seed sample data
npm run db:seed

# Start the server
npm start
```

Backend will run on: http://localhost:5000

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

Frontend will run on: http://localhost:3000

## Default Admin Credentials

After seeding the database, you can login with:

| Username   | Password  | Role       |
|------------|-----------|------------|
| admin      | admin123  | superadmin |
| registrar  | admin123  | registrar  |
| finance    | admin123  | finance    |

## Features

### Dashboard
- Overview statistics (students, faculty, courses, enrollments)
- Recent admissions
- Recent payments
- Financial summary

### Student Management
- View all students
- Add new students (admin authorized)
- View student details with enrollments, payments, scholarships
- Filter by program
- Search by name or registration number

### Course Management
- View all courses
- Add new courses
- Assign instructors
- Filter by program

### Enrollment
- Enroll students in courses
- Admin authorization required
- Track enrollment status

### Exam Management
- Record exam results
- Automatic grade calculation
- View marks per enrollment

### Payments
- Record student payments
- Track payment status
- Financial summary

### Scholarships
- Award scholarships to students
- Track scholarship status

### Faculty Management
- Add/view faculty members
- Assign to departments

### Programs & Departments
- Manage academic programs
- Manage departments

### Admin Users
- Add new admin users
- Set roles (superadmin, registrar, finance, admin)
- Activate/suspend accounts

### Activity Log
- Complete audit trail of all admin actions
- Track who changed what and when

## API Endpoints

### Authentication
- `POST /api/auth/login` - Admin login
- `GET /api/auth/me` - Get current admin
- `POST /api/auth/change-password` - Change password

### Resources
- `GET/POST /api/departments` - Departments
- `GET/POST /api/programs` - Programs
- `GET/POST /api/faculty` - Faculty
- `GET/POST /api/students` - Students
- `GET/POST /api/courses` - Courses
- `GET/POST /api/enrollments` - Enrollments
- `GET/POST /api/exams` - Exams
- `GET/POST /api/payments` - Payments
- `GET/POST /api/scholarships` - Scholarships
- `GET /api/admin` - Admin users
- `GET /api/admin/logs/recent` - Activity logs
- `GET /api/dashboard/stats` - Dashboard statistics

## Technologies Used

### Frontend
- React 18
- React Router DOM 6
- Vite (build tool)

### Backend
- Express.js
- pg (PostgreSQL client)
- bcryptjs (password hashing)
- jsonwebtoken (JWT auth)
- dotenv (environment config)

### Database
- PostgreSQL
- Direct SQL queries (no ORM for simplicity)

## Notes

- All admin actions are logged in `admin_action_log` table
- Student admission requires admin verification
- Enrollment requires admin authorization
- Passwords are hashed using bcrypt
- JWT tokens expire after 24 hours
- CGPA is capped between 0.00 and 4.00
- Payment and scholarship amounts must be non-negative

## License

MIT License - For educational use.
