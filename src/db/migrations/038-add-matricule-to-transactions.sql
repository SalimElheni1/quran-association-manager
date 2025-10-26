-- Migration: Add matricule to transactions table
-- Description: Adds a column to store the student matricule for easy reference.

ALTER TABLE transactions ADD COLUMN matricule TEXT;
