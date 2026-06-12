-- Migration: Add Points column to Briefings table
ALTER TABLE "Briefings" ADD COLUMN "Points" INTEGER DEFAULT 0;
