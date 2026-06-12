-- Supabase Schema Migration: Daily Work Logs System
-- Table definitions preserve casing to match frontend property accesses.

-- Disable foreign key checks temporarily if needed, but not required for fresh run.
-- Drop tables if they exist to allow clean re-import
DROP TABLE IF EXISTS "ActivityLogs" CASCADE;
DROP TABLE IF EXISTS "BriefingResponses" CASCADE;
DROP TABLE IF EXISTS "Briefings" CASCADE;
DROP TABLE IF EXISTS "Tasks" CASCADE;
DROP TABLE IF EXISTS "Users" CASCADE;
DROP TABLE IF EXISTS "Positions" CASCADE;

-- 1. Positions Master Table
CREATE TABLE "Positions" (
  "ID" TEXT PRIMARY KEY,
  "Name" TEXT NOT NULL UNIQUE,
  "Color" TEXT DEFAULT 'bg-blue-100 text-blue-600',
  "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  "UpdatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Users Table
CREATE TABLE "Users" (
  "ID" TEXT PRIMARY KEY,
  "Username" TEXT NOT NULL UNIQUE,
  "Password" TEXT NOT NULL,
  "Role" TEXT DEFAULT 'Staff',
  "Department" TEXT,
  "Name" TEXT,
  "ProfileImage" TEXT,
  "Position" TEXT REFERENCES "Positions"("ID") ON DELETE SET NULL,
  "Permissions" JSONB DEFAULT '{}'::jsonb,
  "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  "UpdatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tasks Table
CREATE TABLE "Tasks" (
  "ID" TEXT PRIMARY KEY,
  "Detail" TEXT,
  "Status" TEXT,
  "Priority" TEXT,
  "StartDate" TEXT,
  "DueDate" TEXT,
  "UserID" TEXT REFERENCES "Users"("ID") ON DELETE SET NULL,
  "StaffName" TEXT,
  "Department" TEXT,
  "Note" TEXT,
  "CustomFields" JSONB DEFAULT '{}'::jsonb,
  "Image1" TEXT,
  "Image2" TEXT,
  "Image3" TEXT,
  "Image4" TEXT,
  "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  "UpdatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  "CompletedAt" TIMESTAMP WITH TIME ZONE
);

-- 4. Briefings Table
CREATE TABLE "Briefings" (
  "ID" TEXT PRIMARY KEY,
  "RunningID" TEXT,
  "Title" TEXT,
  "CreatorID" TEXT REFERENCES "Users"("ID") ON DELETE SET NULL,
  "Detail" TEXT,
  "CreatorNote" TEXT,
  "Assignees" JSONB DEFAULT '[]'::jsonb,
  "Status" TEXT DEFAULT 'รอดำเนินการ',
  "Priority" TEXT,
  "StartDate" TEXT,
  "DueDate" TEXT,
  "RefImage1" TEXT,
  "RefImage2" TEXT,
  "RefImage3" TEXT,
  "RefImage4" TEXT,
  "RefImage5" TEXT,
  "RefImage6" TEXT,
  "RefURL" TEXT,
  "LastUpdatedBy" TEXT REFERENCES "Users"("ID") ON DELETE SET NULL,
  "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  "UpdatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  "CompletedAt" TIMESTAMP WITH TIME ZONE,
  "CardColor" TEXT,
  "PostStatus" TEXT DEFAULT 'ยังไม่โพส',
  "PostUrl" TEXT,
  "PostDate" TEXT,
  "Points" INTEGER DEFAULT 0
);

-- 5. Briefing Responses Table
CREATE TABLE "BriefingResponses" (
  "ID" TEXT PRIMARY KEY,
  "BriefingID" TEXT REFERENCES "Briefings"("ID") ON DELETE CASCADE,
  "UserID" TEXT REFERENCES "Users"("ID") ON DELETE CASCADE,
  "ResultImage1" TEXT,
  "ResultImage2" TEXT,
  "ResultImage3" TEXT,
  "ResultImage4" TEXT,
  "ResultImage5" TEXT,
  "ResultImage6" TEXT,
  "URL1" TEXT,
  "URL2" TEXT,
  "Status" TEXT,
  "Note" TEXT,
  "ReviewImage1" TEXT,
  "ReviewImage2" TEXT,
  "ReviewImage3" TEXT,
  "ReviewImage4" TEXT,
  "ReviewImage5" TEXT,
  "ReviewImage6" TEXT,
  "UpdatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Activity Logs Table
CREATE TABLE "ActivityLogs" (
  "ID" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "Timestamp" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  "UserID" TEXT,
  "Action" TEXT,
  "Details" TEXT
);

-- 7. Optimized view for Tasks Summary (excludes base64 image strings to speed up loading)
CREATE OR REPLACE VIEW "TasksSummary" AS
SELECT 
  "ID", 
  "Detail", 
  "Status", 
  "Priority", 
  "StartDate", 
  "DueDate", 
  "UserID", 
  "StaffName", 
  "Department", 
  "CustomFields", 
  "CreatedAt", 
  "CompletedAt",
  (
    ("Image1" IS NOT NULL AND "Image1" != '') OR
    ("Image2" IS NOT NULL AND "Image2" != '') OR
    ("Image3" IS NOT NULL AND "Image3" != '') OR
    ("Image4" IS NOT NULL AND "Image4" != '')
  ) AS "HasImages"
FROM "Tasks";

-- Indexes for performance tuning
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_dept ON "Tasks"("UserID", "Status", "Department");
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON "Tasks"("CreatedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_dept_status ON "Tasks"("Department", "Status");

CREATE INDEX IF NOT EXISTS idx_users_login ON "Users"("Username");
CREATE INDEX IF NOT EXISTS idx_users_username_password ON "Users"("Username", "Password");

CREATE INDEX IF NOT EXISTS idx_briefings_created_at ON "Briefings"("CreatedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_briefings_creator_id ON "Briefings"("CreatorID");
CREATE INDEX IF NOT EXISTS idx_briefings_assignees_gin ON "Briefings" USING gin ("Assignees");

CREATE INDEX IF NOT EXISTS idx_briefing_responses ON "BriefingResponses"("BriefingID", "UserID");
