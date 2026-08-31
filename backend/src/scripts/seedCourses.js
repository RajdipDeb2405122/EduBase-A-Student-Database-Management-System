const { Pool } = require('pg');
require('dotenv').config();

async function seedCourses() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'edubase',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    // Clear existing CSE courses
    await pool.query(`DELETE FROM course WHERE program_id = 1`);
    
    // CSE Courses (Level 1 Term 1)
    const level1term1 = [
      { code: 'CSE101', title: 'Structured Programming Language', credits: 3.00 },
      { code: 'CSE102', title: 'Structured Programming Language Sessional', credits: 1.50 },
      { code: 'CSE103', title: 'Discrete Mathematics', credits: 3.00 },
      { code: 'CSE109', title: 'Computer Programming', credits: 3.00 },
      { code: 'CSE110', title: 'Computer Programming Sessional', credits: 1.50 },
      { code: 'EEE163', title: 'Introduction to Electrical Engineering', credits: 3.00 },
      { code: 'EEE164', title: 'Introduction to Electrical Engineering Sessional', credits: 0.75 },
      { code: 'MATH141', title: 'Calculus I', credits: 3.00 },
      { code: 'PHY114', title: 'Physics Sessional', credits: 0.75 },
      { code: 'PHY129', title: 'Structure of Matter, Electricity & Magnetism, Wave Mechanics', credits: 3.00 },
      { code: 'CHEM113', title: 'Chemistry', credits: 3.00 },
      { code: 'CHEM118', title: 'Chemistry Sessional', credits: 0.75 },
    ];

    // CSE Courses (Level 1 Term 2)
    const level1term2 = [
      { code: 'CSE105', title: 'Data Structures and Algorithms I', credits: 3.00 },
      { code: 'CSE106', title: 'Data Structures and Algorithms I Sessional', credits: 1.50 },
      { code: 'CSE107', title: 'Object Oriented Programming Language', credits: 3.00 },
      { code: 'CSE108', title: 'Object Oriented Programming Language Sessional', credits: 1.50 },
      { code: 'MATH143', title: 'Linear Algebra', credits: 3.00 },
      { code: 'ME165', title: 'Basic Mechanical Engineering', credits: 3.00 },
      { code: 'ME174', title: 'Mechanical Engineering Drawing and CAD', credits: 1.50 },
    ];

    // CSE Courses (Level 2 Term 1)
    const level2term1 = [
      { code: 'CSE205', title: 'Digital Logic Design', credits: 3.00 },
      { code: 'CSE206', title: 'Digital Logic Design Sessional', credits: 1.50 },
      { code: 'CSE207', title: 'Data Structures and Algorithms II', credits: 3.00 },
      { code: 'CSE208', title: 'Data Structures and Algorithms II Sessional', credits: 1.50 },
      { code: 'CSE215', title: 'Database', credits: 3.00 },
      { code: 'CSE216', title: 'Database Sessional', credits: 1.50 },
      { code: 'CSE273', title: 'Computer Programming and Numerical Analysis for Materials Modeling', credits: 3.00 },
      { code: 'CSE274', title: 'Computer Programming and Numerical Analysis for Materials Modeling Sessional', credits: 1.50 },
      { code: 'CSE281', title: 'Computer Programming', credits: 3.00 },
      { code: 'CSE282', title: 'Computer Programming Sessional', credits: 1.50 },
      { code: 'CSE287', title: 'Computer Programming', credits: 3.00 },
      { code: 'CSE288', title: 'Computer Programming Sessional', credits: 1.50 },
      { code: 'CSE295', title: 'Computer Programming Techniques', credits: 3.00 },
      { code: 'CSE296', title: 'Computer Programming Techniques Sessional', credits: 1.50 },
      { code: 'EEE263', title: 'Electronic Devices and Circuits', credits: 3.00 },
      { code: 'EEE264', title: 'Electronic Devices and Circuits Sessional', credits: 1.50 },
      { code: 'MATH241', title: 'Advanced Calculus', credits: 3.00 },
      { code: 'CSE200', title: 'Technical Writing and Presentation', credits: 1.50 },
    ];

    // CSE Courses (Level 2 Term 2)
    const level2term2 = [
      { code: 'CSE209', title: 'Computer Architecture', credits: 3.00 },
      { code: 'CSE210', title: 'Computer Architecture Sessional', credits: 1.50 },
      { code: 'CSE211', title: 'Theory of Computation', credits: 3.00 },
      { code: 'CSE213', title: 'Software Engineering', credits: 3.00 },
      { code: 'CSE214', title: 'Software Engineering Sessional', credits: 1.50 },
      { code: 'CSE219', title: 'Signals and Linear Systems', credits: 3.00 },
      { code: 'CSE220', title: 'Signals and Linear Systems Sessional', credits: 1.50 },
      { code: 'CSE283', title: 'Digital Techniques', credits: 3.00 },
      { code: 'CSE284', title: 'Digital Techniques Sessional', credits: 1.50 },
      { code: 'MATH243', title: 'Complex Variable and Statistics', credits: 3.00 },
      { code: 'CSE301', title: 'Mathematical Analysis for Computer Science', credits: 3.00 },
    ];

    // CSE Courses (Level 3 Term 1)
    const level3term1 = [
      { code: 'CSE309', title: 'Compiler', credits: 3.00 },
      { code: 'CSE310', title: 'Compiler Sessional', credits: 1.50 },
      { code: 'CSE313', title: 'Operating System', credits: 3.00 },
      { code: 'CSE314', title: 'Operating System Sessional', credits: 1.50 },
      { code: 'CSE315', title: 'Microprocessors, Microcontrollers, and Embedded Systems', credits: 3.00 },
      { code: 'CSE316', title: 'Microprocessors, Microcontrollers, and Embedded Systems Sessional', credits: 1.50 },
      { code: 'CSE317', title: 'Artificial Intelligence', credits: 3.00 },
      { code: 'CSE318', title: 'Artificial Intelligence Sessional', credits: 1.50 },
      { code: 'CSE391', title: 'Embedded Systems and Interfacing', credits: 3.00 },
      { code: 'CSE392', title: 'Embedded Systems and Interfacing Sessional', credits: 1.50 },
    ];

    // CSE Courses (Level 3 Term 2)
    const level3term2 = [
      { code: 'CSE272', title: 'Database Management Sessional', credits: 1.50 },
      { code: 'CSE311', title: 'Data Communication', credits: 3.00 },
      { code: 'CSE321', title: 'Computer Networks', credits: 3.00 },
      { code: 'CSE322', title: 'Computer Networks Sessional', credits: 1.50 },
      { code: 'CSE325', title: 'Information System Design', credits: 3.00 },
      { code: 'CSE326', title: 'Information System Design Sessional', credits: 1.50 },
      { code: 'CSE329', title: 'Machine Learning', credits: 3.00 },
      { code: 'CSE330', title: 'Machine Learning Sessional', credits: 1.50 },
      { code: 'CSE450', title: 'Capstone Project', credits: 6.00 },
      { code: 'HUM347', title: 'Ethics in Society and E-Governance', credits: 2.00 },
      { code: 'CSE400', title: 'Project and Thesis', credits: 6.00 },
    ];

    // CSE Courses (Level 4 Term 1)
    const level4term1 = [
      { code: 'CSE401', title: 'Numerical Analysis, Simulation and Modeling', credits: 3.00 },
      { code: 'CSE402', title: 'Numerical Analysis, Simulation and Modeling Sessional', credits: 1.50 },
      { code: 'CSE405', title: 'Cyber Security', credits: 3.00 },
      { code: 'CSE406', title: 'Cyber Security Sessional', credits: 1.50 },
      { code: 'CSE408', title: 'Software Development Sessional', credits: 1.50 },
      { code: 'CSE409', title: 'Computer Graphics', credits: 3.00 },
      { code: 'CSE410', title: 'Computer Graphics Sessional', credits: 1.50 },
      { code: 'CSE421', title: 'Basic Graph Theory', credits: 3.00 },
      { code: 'CSE423', title: 'Fault Tolerant Systems', credits: 3.00 },
      { code: 'CSE425', title: 'Human Computer Interaction', credits: 3.00 },
      { code: 'CSE429', title: 'Deep Learning', credits: 3.00 },
      { code: 'CSE433', title: 'Digital Image Processing', credits: 3.00 },
      { code: 'CSE435', title: 'Basic Multimedia Theory', credits: 3.00 },
      { code: 'CSE453', title: 'High Performance Database System', credits: 3.00 },
      { code: 'CSE457', title: 'Wireless Networks', credits: 3.00 },
      { code: 'CSE458', title: 'Wireless Networks Sessional', credits: 1.50 },
      { code: 'CSE459', title: 'Communication Systems', credits: 3.00 },
      { code: 'CSE463', title: 'Introduction to Bioinformatics', credits: 3.00 },
      { code: 'CSE465', title: 'Semantics of Programming Languages', credits: 3.00 },
      { code: 'CSE467', title: 'Software Architecture', credits: 3.00 },
      { code: 'CSE495', title: 'Bioinformatics', credits: 3.00 },
      { code: 'EEE463', title: 'Optical Communications', credits: 3.00 },
      { code: 'EEE465', title: 'Telecommunication Systems', credits: 3.00 },
      { code: 'HUM211', title: 'Sociology', credits: 2.00 },
      { code: 'HUM475', title: 'Engineering Economics', credits: 2.00 },
    ];

    // CSE Courses (Level 4 Term 2)
    const level4term2 = [
      { code: 'CSE411', title: 'Simulation and Modeling', credits: 3.00 },
      { code: 'CSE412', title: 'Simulation and Modeling Sessional', credits: 1.50 },
      { code: 'CSE413', title: 'High Performance Computing', credits: 3.00 },
      { code: 'CSE414', title: 'High Performance Computing Sessional', credits: 1.50 },
      { code: 'CSE415', title: 'Real-time Embedded Systems', credits: 3.00 },
      { code: 'CSE416', title: 'Real-time Embedded Systems Sessional', credits: 1.50 },
      { code: 'CSE451', title: 'Computer Networks', credits: 3.00 },
      { code: 'CSE452', title: 'Computer Networks Sessional', credits: 1.50 },
      { code: 'CSE461', title: 'Algorithm Engineering', credits: 3.00 },
      { code: 'CSE462', title: 'Algorithm Engineering Sessional', credits: 1.50 },
      { code: 'CSE473', title: 'Pattern Recognition', credits: 3.00 },
      { code: 'CSE474', title: 'Pattern Recognition Sessional', credits: 1.50 },
      { code: 'CSE475', title: 'Robotics', credits: 3.00 },
      { code: 'CSE476', title: 'Robotics Sessional', credits: 1.50 },
      { code: 'CSE481', title: 'VLSI Design', credits: 3.00 },
      { code: 'CSE482', title: 'VLSI Design Sessional', credits: 1.50 },
      { code: 'CSE483', title: 'Interfacing', credits: 3.00 },
      { code: 'CSE484', title: 'Interfacing Sessional', credits: 1.50 },
      { code: 'CSE485', title: 'Digital Signal Processing', credits: 3.00 },
      { code: 'CSE486', title: 'Digital Signal Processing Sessional', credits: 1.50 },
      { code: 'CSE487', title: 'Mobile Applications Development', credits: 3.00 },
      { code: 'CSE488', title: 'Mobile Applications Development Sessional', credits: 1.50 },
      { code: 'EEE469', title: 'Electrical Machines and Instrumentation', credits: 3.00 },
      { code: 'HUM275', title: 'Economics', credits: 2.00 },
      { code: 'HUM371', title: 'Financial and Managerial Accounting', credits: 2.00 },
      { code: 'HUM402', title: 'Professional Communication in English Sessional', credits: 0.75 },
      { code: 'HUM403', title: 'Communication in English', credits: 1.00 },
      { code: 'HUM411', title: 'Business Law', credits: 2.00 },
      { code: 'HUM429', title: 'Accounting and Entrepreneurship for IT Business', credits: 2.00 },
      { code: 'HUM473', title: 'Financial, Cost and Managerial Accounting', credits: 2.00 },
      { code: 'HUM477', title: 'Sociology for Science and Technology', credits: 2.00 },
      { code: 'HUM479', title: 'Government', credits: 2.00 },
      { code: 'HUM481', title: 'Entrepreneurship for IT Business', credits: 2.00 },
      { code: 'IPE493', title: 'Industrial Management', credits: 2.00 },
    ];

    // Helper to insert courses
    const insertCourses = async (courses, level, term, programId = 1) => {
      for (const course of courses) {
        await pool.query(
          `INSERT INTO course (program_id, course_code, course_title, credit_hours, term_no, course_type, active)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           ON CONFLICT (course_code) DO UPDATE SET
           course_title = $3, credit_hours = $4, term_no = $5`,
          [programId, course.code, course.title, course.credits, level + term, 'Core']
        );
      }
    };

    // Insert all courses
    await insertCourses(level1term1, 1, 1);
    await insertCourses(level1term2, 1, 2);
    await insertCourses(level2term1, 2, 1);
    await insertCourses(level2term2, 2, 2);
    await insertCourses(level3term1, 3, 1);
    await insertCourses(level3term2, 3, 2);
    await insertCourses(level4term1, 4, 1);
    await insertCourses(level4term2, 4, 2);

    console.log('✅ BUET CSE Courses seeded successfully!');
    console.log('Total courses: ' + (
      level1term1.length + level1term2.length + level2term1.length + level2term2.length +
      level3term1.length + level3term2.length + level4term1.length + level4term2.length
    ));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

seedCourses();