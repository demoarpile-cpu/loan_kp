/*
  Warnings:

  - Added the required column `company` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `employeeEmail` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `employeeName` to the `Loan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `loan` ADD COLUMN `company` VARCHAR(191) NOT NULL,
    ADD COLUMN `employeeEmail` VARCHAR(191) NOT NULL,
    ADD COLUMN `employeeName` VARCHAR(191) NOT NULL,
    ADD COLUMN `stage` VARCHAR(191) NOT NULL DEFAULT 'SUBMITTED';
