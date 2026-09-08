const bcrypt = require('bcryptjs');

const {
  check, text, id, email, password, date, number, log
} = require('./common');

const tables = {
  admin: 'admin',
  student: 'student',
  faculty: 'faculty'
};

const selects = {
  admin: `
    SELECT
      a.admin_id,a.user_id,u.username,u.full_name,u.email,
      a.role,a.status,u.last_login
    FROM admin a
    JOIN users u ON u.user_id=a.user_id
  `,
  faculty: `
    SELECT f.*,d.department_name
    FROM faculty_public f
    LEFT JOIN department d ON d.department_id=f.department_id
  `,
  student: `
    SELECT
      s.*,p.program_name,p.degree_level,
      f.full_name AS advisor_name,
      a.full_name AS verified_by_name
    FROM student s
    LEFT JOIN program p ON p.program_id=s.program_id
    LEFT JOIN faculty_public f ON f.faculty_id=s.advisor_id
    LEFT JOIN admin_public a ON a.admin_id=s.verified_by_admin_id
  `
};

const aliases = {
  admin: 'a',
  student: 's',
  faculty: 'f'
};

async function profile(db, role, key) {
  const r = await db.query(`
    ${selects[role]}
    WHERE ${aliases[role]}.${role}_id=$1
  `, [key]);

  check(r.rowCount, 'Account not found', 404);
  return r.rows[0];
}

function fields(role, body) {
  const full_name = text(body.full_name, 'full name');
  const mail = email(body.email);
  const phone = text(body.phone, 'phone', 20, false);

  let status = body.status || 'active';

  if (status === 'suspended') status = 'blocked';

  if (role === 'student') {
    check(
      ['active', 'inactive', 'suspended', 'graduated']
        .includes(body.current_status || 'active'),
      'Invalid student status'
    );

    status = (body.current_status || 'active') === 'active'
      ? 'active'
      : 'inactive';
  }

  check(
    ['active', 'blocked', 'inactive'].includes(status),
    'Invalid account status'
  );

  return {
    full_name,
    email: mail,
    phone,
    status
  };
}

async function validateProfile(db, role, body, previous = null) {
  if (role === 'student') {
    body.program_id = id(body.program_id, 'program');
    body.advisor_id = id(body.advisor_id, 'advisor', true);

    const p = await db.query(
      'SELECT 1 FROM program WHERE program_id=$1',
      [body.program_id]
    );

    check(p.rowCount, 'Program not found');

    // Existing historical advisor relationships can remain unchanged.
    // Newly assigned advisors must be active.
    if (
      body.advisor_id &&
      (!previous || body.advisor_id !== previous.advisor_id)
    ) {
      const f = await db.query(`
        SELECT 1 FROM faculty_public
        WHERE faculty_id=$1 AND status='active'
      `, [body.advisor_id]);

      check(f.rowCount, 'Select an active faculty advisor');
    }

    body.registration_no = text(
      body.registration_no,
      'registration number',
      50
    );

    body.date_of_birth = date(body.date_of_birth, 'date of birth');
    body.admission_date = date(body.admission_date, 'admission date');
    body.current_cgpa = number(body.current_cgpa ?? 0, 'CGPA', 0, 4);
  } else if (role === 'faculty') {
    body.department_id = id(body.department_id, 'department');

    const d = await db.query(
      'SELECT 1 FROM department WHERE department_id=$1',
      [body.department_id]
    );

    check(d.rowCount, 'Department not found');

    body.designation = text(
      body.designation || 'Lecturer',
      'designation',
      50
    );
  } else {
    body.username = text(body.username, 'username', 50);

    check(
      ['admin', 'superadmin', 'registrar', 'finance', 'academic']
        .includes(body.role || 'admin'),
      'Invalid admin role'
    );
  }
}

async function createAccount(
  db,
  role,
  input,
  adminId,
  preparedHash = null
) {
  check(tables[role], 'Invalid role');

  const body = { ...input };
  const u = fields(role, body);

  await validateProfile(db, role, body);

  const hash = preparedHash ||
    await bcrypt.hash(password(body.password), 12);

  const username = role === 'admin'
    ? body.username
    : role === 'student'
      ? body.registration_no
      : null;

  const r = await db.query(`
    INSERT INTO users (
      username,email,password_hash,full_name,
      phone,date_of_birth,role,status
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING user_id
  `, [
    username,
    u.email,
    hash,
    u.full_name,
    u.phone,
    role === 'student' ? body.date_of_birth : null,
    role,
    u.status
  ]);

  const userId = r.rows[0].user_id;
  let result;

  if (role === 'admin') {
    result = await db.query(`
      INSERT INTO admin(user_id,role,status)
      VALUES($1,$2,$3)
      RETURNING admin_id
    `, [
      userId,
      body.role || 'admin',
      u.status === 'blocked' ? 'suspended' : u.status
    ]);
  } else if (role === 'faculty') {
    result = await db.query(`
      INSERT INTO faculty(user_id,department_id,designation,phone)
      VALUES($1,$2,$3,$4)
      RETURNING faculty_id
    `, [
      userId,
      body.department_id,
      body.designation,
      u.phone
    ]);
  } else {
    result = await db.query(`
      INSERT INTO student (
        user_id,program_id,advisor_id,verified_by_admin_id,
        registration_no,full_name,email,phone,date_of_birth,
        admission_date,current_status,current_cgpa
      )
      VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        COALESCE($10::date,CURRENT_DATE),$11,$12
      )
      RETURNING student_id
    `, [
      userId,
      body.program_id,
      body.advisor_id,
      adminId,
      body.registration_no,
      u.full_name,
      u.email,
      u.phone,
      body.date_of_birth,
      body.admission_date,
      body.current_status || 'active',
      body.current_cgpa
    ]);
  }

  const key = result.rows[0][`${role}_id`];

  await log(
    db, adminId, role, key, 'CREATE',
    `Created ${role}: ${u.full_name}`
  );

  return profile(db, role, key);
}

async function updateAccount(db, role, key, input, actorId) {
  const found = await db.query(`
    SELECT to_jsonb(u) AS account,to_jsonb(p) AS profile
    FROM users u
    JOIN ${tables[role]} p ON p.user_id=u.user_id
    WHERE p.${role}_id=$1
    FOR UPDATE OF u,p
  `, [key]);

  check(found.rowCount, 'Account not found', 404);

  const { account, profile: old } = found.rows[0];
  const body = { ...account, ...old, ...input };

  if (role === 'admin') {
    body.role = input.role ?? old.role;
  }

  const u = fields(role, body);

  await validateProfile(db, role, body, old);

  check(
    !(role === 'admin' && key === actorId && u.status !== 'active'),
    'You cannot deactivate your own account'
  );

  if (
    role === 'faculty' &&
    body.department_id !== old.department_id
  ) {
    const used = await db.query(
      'SELECT 1 FROM course WHERE faculty_id=$1 LIMIT 1',
      [key]
    );

    check(
      !used.rowCount,
      'Unassign this faculty member’s courses before changing department'
    );
  }

  await db.query(`
    UPDATE users
    SET full_name=$1,
        email=$2,
        phone=$3,
        status=$4::varchar,
        date_of_birth=$5,
        username=$6,
        token_version=token_version+
          CASE WHEN status<>$4::varchar THEN 1 ELSE 0 END
    WHERE user_id=$7
  `, [
    u.full_name,
    u.email,
    u.phone,
    u.status,
    role === 'student'
      ? body.date_of_birth
      : account.date_of_birth,
    role === 'admin'
      ? body.username
      : role === 'student'
        ? body.registration_no
        : account.username,
    account.user_id
  ]);

  if (role === 'admin') {
    await db.query(`
      UPDATE admin
      SET role=$1,status=$2
      WHERE admin_id=$3
    `, [
      body.role,
      u.status === 'blocked' ? 'suspended' : u.status,
      key
    ]);
  } else if (role === 'faculty') {
    await db.query(`
      UPDATE faculty
      SET department_id=$1,designation=$2
      WHERE faculty_id=$3
    `, [body.department_id, body.designation, key]);
  } else {
    await db.query(`
      UPDATE student
      SET program_id=$1,
          advisor_id=$2,
          registration_no=$3,
          admission_date=COALESCE($4::date,admission_date),
          current_status=$5,
          current_cgpa=$6
      WHERE student_id=$7
    `, [
      body.program_id,
      body.advisor_id,
      body.registration_no,
      body.admission_date,
      body.current_status,
      body.current_cgpa,
      key
    ]);
  }

  await log(
    db, actorId, role, key, 'UPDATE',
    `Updated ${role}: ${u.full_name}`
  );

  return profile(db, role, key);
}

module.exports = {
  tables,
  selects,
  aliases,
  profile,
  createAccount,
  updateAccount
};