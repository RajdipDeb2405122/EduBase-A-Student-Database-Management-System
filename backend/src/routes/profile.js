const express = require('express');
const sharp = require('sharp');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap,
  check,
  text,
  date,
  transaction
} = require('../lib/common');

const router = express.Router();

router.use(
  auth,
  auth.allow('student', 'faculty')
);

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const profileSQL = `
  SELECT
    u.user_id,
    u.role,
    u.full_name,
    u.email,
    u.phone,
    u.date_of_birth,
    u.bengali_name,
    u.father_name,
    u.mother_name,
    u.address,
    u.emergency_contact_name,
    u.emergency_contact_phone,
    u.profile_photo,
    f.office_location,
    f.office_hours

  FROM users u

  LEFT JOIN faculty f
    ON f.user_id=u.user_id

  WHERE u.user_id=$1
`;

async function getProfile(db, userId) {
  const result = await db.query(
    profileSQL,
    [userId]
  );

  check(result.rowCount, 'Profile not found', 404);

  return result.rows[0];
}

const userFields = {
  phone: ['phone', 20],
  bengali_name: ['Bengali name', 150],
  father_name: ["father's name", 150],
  mother_name: ["mother's name", 150],
  address: ['address', 1000],
  emergency_contact_name: ['emergency contact name', 150],
  emergency_contact_phone: ['emergency contact phone', 30]
};

const officeFields = {
  office_location: ['office location', 100],
  office_hours: ['office hours', 200]
};

router.get('/me', wrap(async (req, res) => {
  res.json(
    await getProfile(pool, req.user.user_id)
  );
}));

router.put('/me', wrap(async (req, res) => {
  check(
    req.body &&
      typeof req.body === 'object' &&
      !Array.isArray(req.body),
    'Invalid profile data'
  );

  const allowed = new Set([
    ...Object.keys(userFields),
    'date_of_birth',
    ...(req.user.role === 'faculty'
      ? Object.keys(officeFields)
      : [])
  ]);

  const keys = Object.keys(req.body);

  check(keys.length > 0, 'No changes supplied');

  check(
    keys.every(key => allowed.has(key)),
    'Some fields are not editable from this profile form'
  );

  const personal = [];
  const office = [];

  for (const key of keys) {
    if (key === 'date_of_birth') {
      const birthday = date(
        req.body[key],
        'date of birth'
      );

      check(
        !birthday ||
          birthday <= new Date().toISOString().slice(0, 10),
        'Date of birth cannot be in the future'
      );

      personal.push([key, birthday]);
    } else if (Object.hasOwn(userFields, key)) {
      const [label, maximum] = userFields[key];

      personal.push([
        key,
        text(req.body[key], label, maximum, false)
      ]);
    } else {
      const [label, maximum] = officeFields[key];

      office.push([
        key,
        text(req.body[key], label, maximum, false)
      ]);
    }
  }

  const result = await transaction(async db => {
    await db.query(
      'SELECT user_id FROM users WHERE user_id=$1 FOR UPDATE',
      [req.user.user_id]
    );

    // Table and column names come only from the fixed allowlists.
    for (const [table, changes] of [
      ['users', personal],
      ['faculty', office]
    ]) {
      if (!changes.length) continue;

      const assignments = changes
        .map(([key], index) => `${key}=$${index + 1}`)
        .join(',');

      const values = changes.map(([, value]) => value);
      values.push(req.user.user_id);

      await db.query(
        `UPDATE ${table}
         SET ${assignments}
         WHERE user_id=$${values.length}`,
        values
      );
    }

    // No changes to credentials, role, status, registration number or CGPA.
    return getProfile(db, req.user.user_id);
  });

  res.json(result);
}));

const upload = express.raw({
  type: [
    'image/jpeg',
    'image/png',
    'image/webp'
  ],
  limit: '3mb'
});

router.put('/photo', upload, wrap(async (req, res) => {
  const image = req.body;

  check(
    Buffer.isBuffer(image) && image.length > 0,
    'Upload a JPG, PNG or WebP image',
    415
  );

  // Check the real file signature before using an image decoder.
  const jpeg =
    image.length >= 3 &&
    image[0] === 0xff &&
    image[1] === 0xd8 &&
    image[2] === 0xff;

  const png =
    image.length >= 8 &&
    image.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );

  const webp =
    image.length >= 12 &&
    image.toString('ascii', 0, 4) === 'RIFF' &&
    image.toString('ascii', 8, 12) === 'WEBP';

  check(
    jpeg || png || webp,
    'Only genuine JPG, PNG or WebP images are allowed',
    415
  );

  let output;

  try {
    const decoder = sharp(image, {
      limitInputPixels: 25000000,
      animated: false,
      failOn: 'error'
    });

    const metadata = await decoder.metadata();

    check(
      ['jpeg', 'png', 'webp'].includes(metadata.format),
      'Unsupported image'
    );

    check(
      !metadata.pages || metadata.pages === 1,
      'Animated images are not supported'
    );

    output = await decoder
      .rotate()
      .resize(256, 256, {
        fit: 'cover',
        position: 'centre'
      })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    check(
      false,
      'The image is invalid, animated, or larger than 25 megapixels'
    );
  }

  check(
    output.length <= 150000,
    'Please choose a simpler or smaller photo'
  );

  // Re-encoding removes EXIF/GPS metadata.
  // Keeping a small thumbnail in the DB avoids public upload directories.
  const dataUrl =
    `data:image/jpeg;base64,${output.toString('base64')}`;

  await pool.query(
    'UPDATE users SET profile_photo=$1 WHERE user_id=$2',
    [dataUrl, req.user.user_id]
  );

  res.json(
    await getProfile(pool, req.user.user_id)
  );
}));

router.delete('/photo', wrap(async (req, res) => {
  await pool.query(
    'UPDATE users SET profile_photo=NULL WHERE user_id=$1',
    [req.user.user_id]
  );

  res.json(
    await getProfile(pool, req.user.user_id)
  );
}));

router.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Photo must be 3 MB or smaller'
    });
  }

  next(error);
});

module.exports = router;