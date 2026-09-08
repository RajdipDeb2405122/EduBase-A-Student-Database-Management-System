-- Additive migration: existing accounts and academic records are retained.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bengali_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS father_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS mother_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS profile_photo TEXT;