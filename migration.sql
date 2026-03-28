-- ============================================================
-- Migration: Registration + Approval + Waitlist
-- Run this on Supabase SQL Editor
-- ============================================================

-- 1. Drop old trigger (capacity is now managed on approval, not insert)
DROP TRIGGER IF EXISTS trg_manage_booking_count ON bookings;
DROP FUNCTION IF EXISTS manage_booking_count();

-- 2. Extend students table
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS phone_number  TEXT,
  ADD COLUMN IF NOT EXISTS is_registered BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Extend bookings table
DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS status        booking_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS parent_phone  TEXT;

-- 4. Create waitlist_requests table
DO $$ BEGIN
  CREATE TYPE waitlist_type AS ENUM ('waitlist', 'general');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS waitlist_requests (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  group_id            UUID         REFERENCES groups(id) ON DELETE SET NULL,
  preferred_time_text TEXT,
  type                waitlist_type NOT NULL,
  notified_at         TIMESTAMPTZ,           -- set when bot notifies this student
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index: find next person in queue for a group (ordered, un-notified first)
CREATE INDEX IF NOT EXISTS idx_waitlist_group_queue
  ON waitlist_requests (group_id, created_at ASC)
  WHERE type = 'waitlist' AND notified_at IS NULL;

-- Index: find all general interest users
CREATE INDEX IF NOT EXISTS idx_waitlist_general
  ON waitlist_requests (created_at ASC)
  WHERE type = 'general' AND notified_at IS NULL;
