-- ============================================================
-- Anish Car Rent — full database setup
-- ============================================================
-- Creates all 32 tables (with relationships) and seeds them with
-- the permission catalogue, Admin & Staff roles, an admin login,
-- expense categories and default settings — the exact same data
-- 'npm run db:seed' would create.
--
-- HOW TO USE
--   phpMyAdmin : open your (empty) database -> Import -> choose
--                this file -> Go.
--   mysql CLI  : mysql -u USER -p DATABASE_NAME < anish_car_rent.sql
--
-- The target database must already exist and be EMPTY — this
-- script does not create or drop the database itself, only the
-- tables inside it.
--
-- LOGIN AFTER IMPORT
--   Email:    admin@anishcarrent.com
--   Password: Admin@12345
--   Change this password immediately after your first sign-in
--   (Staff & Users -> Administrator -> Edit).
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── Schema ──────────────────────────────────────────────────

-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `description` VARCHAR(255) NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(80) NOT NULL,
    `module` VARCHAR(40) NOT NULL,
    `action` VARCHAR(20) NOT NULL,
    `label` VARCHAR(120) NOT NULL,

    UNIQUE INDEX `permissions_key_key`(`key`),
    INDEX `permissions_module_idx`(`module`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `roleId` INTEGER NOT NULL,
    `permissionId` INTEGER NOT NULL,

    INDEX `role_permissions_permissionId_idx`(`permissionId`),
    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `staffCode` VARCHAR(20) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `mobile` VARCHAR(20) NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `roleId` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `joiningDate` DATE NULL,
    `avatarUrl` VARCHAR(255) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_staffCode_key`(`staffCode`),
    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_roleId_idx`(`roleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(64) NOT NULL,
    `userId` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastActiveAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sessions_userId_idx`(`userId`),
    INDEX `sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerCode` VARCHAR(20) NOT NULL,
    `fullName` VARCHAR(120) NOT NULL,
    `mobile` VARCHAR(20) NOT NULL,
    `altMobile` VARCHAR(20) NULL,
    `email` VARCHAR(160) NULL,
    `address` TEXT NULL,
    `city` VARCHAR(80) NULL,
    `state` VARCHAR(80) NULL,
    `pincode` VARCHAR(10) NULL,
    `drivingLicenseNo` VARCHAR(40) NULL,
    `licenseExpiry` DATE NULL,
    `idProofType` VARCHAR(40) NULL,
    `idProofNumber` VARCHAR(60) NULL,
    `emergencyContactName` VARCHAR(120) NULL,
    `emergencyContactPhone` VARCHAR(20) NULL,
    `customerType` ENUM('REGULAR', 'VIP', 'CORPORATE') NOT NULL DEFAULT 'REGULAR',
    `status` ENUM('ACTIVE', 'INACTIVE', 'BLACKLISTED') NOT NULL DEFAULT 'ACTIVE',
    `blacklistReason` VARCHAR(255) NULL,
    `photoUrl` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_customerCode_key`(`customerCode`),
    UNIQUE INDEX `customers_mobile_key`(`mobile`),
    INDEX `customers_fullName_idx`(`fullName`),
    INDEX `customers_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER NOT NULL,
    `documentType` VARCHAR(60) NOT NULL,
    `documentNumber` VARCHAR(80) NULL,
    `issueDate` DATE NULL,
    `expiryDate` DATE NULL,
    `fileUrl` VARCHAR(255) NULL,
    `notes` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customer_documents_customerId_idx`(`customerId`),
    INDEX `customer_documents_expiryDate_idx`(`expiryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_notes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER NOT NULL,
    `body` TEXT NOT NULL,
    `authorName` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `customer_notes_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cars` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `registrationNumber` VARCHAR(20) NOT NULL,
    `company` VARCHAR(60) NOT NULL,
    `model` VARCHAR(60) NOT NULL,
    `variant` VARCHAR(60) NULL,
    `year` INTEGER NULL,
    `colour` VARCHAR(40) NULL,
    `fuelType` ENUM('PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID') NOT NULL DEFAULT 'PETROL',
    `transmission` ENUM('MANUAL', 'AUTOMATIC') NOT NULL DEFAULT 'MANUAL',
    `seatingCapacity` INTEGER NULL,
    `chassisNumber` VARCHAR(60) NULL,
    `engineNumber` VARCHAR(60) NULL,
    `currentKm` INTEGER NOT NULL DEFAULT 0,
    `purchaseDate` DATE NULL,
    `purchasePrice` DECIMAL(12, 2) NULL,
    `dailyRate` DECIMAL(10, 2) NOT NULL,
    `includedKmPerDay` INTEGER NOT NULL DEFAULT 300,
    `extraKmRate` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `extraHourRate` DECIMAL(8, 2) NULL,
    `securityDeposit` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `status` ENUM('AVAILABLE', 'RENTED', 'SERVICE', 'INACTIVE') NOT NULL DEFAULT 'AVAILABLE',
    `serviceIntervalKm` INTEGER NULL,
    `serviceDueKm` INTEGER NULL,
    `nextServiceDate` DATE NULL,
    `primaryImageUrl` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cars_registrationNumber_key`(`registrationNumber`),
    INDEX `cars_status_idx`(`status`),
    INDEX `cars_company_model_idx`(`company`, `model`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `car_documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NOT NULL,
    `documentType` VARCHAR(60) NOT NULL,
    `documentNumber` VARCHAR(80) NULL,
    `issuedBy` VARCHAR(120) NULL,
    `issueDate` DATE NULL,
    `expiryDate` DATE NULL,
    `amount` DECIMAL(10, 2) NULL,
    `fileUrl` VARCHAR(255) NULL,
    `notes` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `car_documents_carId_idx`(`carId`),
    INDEX `car_documents_expiryDate_idx`(`expiryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `car_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NOT NULL,
    `url` VARCHAR(255) NOT NULL,
    `caption` VARCHAR(160) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `car_images_carId_idx`(`carId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `car_damage_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NOT NULL,
    `bookingId` INTEGER NULL,
    `panel` VARCHAR(60) NOT NULL,
    `severity` ENUM('MINOR', 'MODERATE', 'MAJOR') NOT NULL DEFAULT 'MINOR',
    `description` TEXT NULL,
    `photoUrl` VARCHAR(255) NULL,
    `chargedTo` VARCHAR(60) NULL,
    `chargeAmount` DECIMAL(10, 2) NULL,
    `repairedAt` DATETIME(3) NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `car_damage_records_carId_idx`(`carId`),
    INDEX `car_damage_records_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rate_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NULL,
    `kind` ENUM('DURATION_SLAB', 'WEEKEND', 'SEASONAL', 'HOLIDAY') NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `minDays` INTEGER NULL,
    `maxDays` INTEGER NULL,
    `startDate` DATE NULL,
    `endDate` DATE NULL,
    `dailyRate` DECIMAL(10, 2) NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `rate_rules_carId_idx`(`carId`),
    INDEX `rate_rules_kind_isActive_idx`(`kind`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bookings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingNumber` VARCHAR(24) NOT NULL,
    `customerId` INTEGER NOT NULL,
    `carId` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'QUOTATION', 'CONFIRMED', 'HANDED_OVER', 'RUNNING', 'RETURNED', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `pickupAt` DATETIME(3) NOT NULL,
    `returnAt` DATETIME(3) NOT NULL,
    `actualPickupAt` DATETIME(3) NULL,
    `actualReturnAt` DATETIME(3) NULL,
    `pickupLocation` VARCHAR(160) NULL,
    `dropLocation` VARCHAR(160) NULL,
    `rentalDays` INTEGER NOT NULL,
    `dailyRate` DECIMAL(10, 2) NOT NULL,
    `includedKmPerDay` INTEGER NOT NULL DEFAULT 300,
    `extraKmRate` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `securityDeposit` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `startingKm` INTEGER NULL,
    `endingKm` INTEGER NULL,
    `rentalAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `extraKmAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `lateFeeAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `fuelAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `damageAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cleaningAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `otherAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discountAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paidAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `depositRefunded` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cancelledAt` DATETIME(3) NULL,
    `cancellationReason` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bookings_bookingNumber_key`(`bookingNumber`),
    INDEX `bookings_customerId_idx`(`customerId`),
    INDEX `bookings_carId_idx`(`carId`),
    INDEX `bookings_status_idx`(`status`),
    INDEX `bookings_pickupAt_idx`(`pickupAt`),
    INDEX `bookings_returnAt_idx`(`returnAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_status_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingId` INTEGER NOT NULL,
    `fromStatus` ENUM('DRAFT', 'QUOTATION', 'CONFIRMED', 'HANDED_OVER', 'RUNNING', 'RETURNED', 'CLOSED', 'CANCELLED') NULL,
    `toStatus` ENUM('DRAFT', 'QUOTATION', 'CONFIRMED', 'HANDED_OVER', 'RUNNING', 'RETURNED', 'CLOSED', 'CANCELLED') NOT NULL,
    `note` VARCHAR(255) NULL,
    `changedById` INTEGER NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `booking_status_history_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicle_handovers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingId` INTEGER NOT NULL,
    `handoverAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startingKm` INTEGER NOT NULL,
    `fuelLevel` VARCHAR(20) NULL,
    `checklist` JSON NULL,
    `damageNotes` TEXT NULL,
    `photos` JSON NULL,
    `customerSignatureUrl` VARCHAR(255) NULL,
    `handedOverById` INTEGER NULL,

    UNIQUE INDEX `vehicle_handovers_bookingId_key`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicle_returns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingId` INTEGER NOT NULL,
    `returnedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endingKm` INTEGER NOT NULL,
    `fuelLevel` VARCHAR(20) NULL,
    `checklist` JSON NULL,
    `damageNotes` TEXT NULL,
    `photos` JSON NULL,
    `lateHours` INTEGER NOT NULL DEFAULT 0,
    `receivedById` INTEGER NULL,

    UNIQUE INDEX `vehicle_returns_bookingId_key`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rental_agreements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingId` INTEGER NOT NULL,
    `agreementNo` VARCHAR(24) NOT NULL,
    `fileUrl` VARCHAR(255) NULL,
    `termsSnapshot` JSON NULL,
    `signedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `rental_agreements_bookingId_key`(`bookingId`),
    UNIQUE INDEX `rental_agreements_agreementNo_key`(`agreementNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `paymentNumber` VARCHAR(24) NOT NULL,
    `customerId` INTEGER NOT NULL,
    `bookingId` INTEGER NULL,
    `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `amount` DECIMAL(12, 2) NOT NULL,
    `paymentType` ENUM('ADVANCE', 'PARTIAL', 'FINAL', 'SECURITY_DEPOSIT', 'PENALTY', 'OTHER') NOT NULL DEFAULT 'PARTIAL',
    `paymentMode` ENUM('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER') NOT NULL DEFAULT 'CASH',
    `status` ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED') NOT NULL DEFAULT 'SUCCESS',
    `referenceNo` VARCHAR(80) NULL,
    `receivedById` INTEGER NULL,
    `notes` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payments_paymentNumber_key`(`paymentNumber`),
    INDEX `payments_customerId_idx`(`customerId`),
    INDEX `payments_bookingId_idx`(`bookingId`),
    INDEX `payments_paidAt_idx`(`paidAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refunds` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `refundNumber` VARCHAR(24) NOT NULL,
    `kind` ENUM('DEPOSIT', 'PAYMENT') NOT NULL DEFAULT 'DEPOSIT',
    `customerId` INTEGER NOT NULL,
    `bookingId` INTEGER NULL,
    `paymentId` INTEGER NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `reason` VARCHAR(255) NULL,
    `refundMode` ENUM('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER') NOT NULL DEFAULT 'CASH',
    `refundedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `issuedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refunds_refundNumber_key`(`refundNumber`),
    INDEX `refunds_customerId_idx`(`customerId`),
    INDEX `refunds_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoiceNumber` VARCHAR(24) NOT NULL,
    `bookingId` INTEGER NULL,
    `customerId` INTEGER NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dueAt` DATETIME(3) NULL,
    `status` ENUM('DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `taxAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paidAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `pdfUrl` VARCHAR(255) NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invoices_invoiceNumber_key`(`invoiceNumber`),
    INDEX `invoices_customerId_idx`(`customerId`),
    INDEX `invoices_bookingId_idx`(`bookingId`),
    INDEX `invoices_issuedAt_idx`(`issuedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoiceId` INTEGER NOT NULL,
    `description` VARCHAR(200) NOT NULL,
    `quantity` DECIMAL(10, 2) NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(12, 2) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `invoice_items_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expense_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(60) NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `expense_categories_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vendors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `address` VARCHAR(255) NULL,
    `gstin` VARCHAR(20) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expenses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `expenseNo` VARCHAR(24) NOT NULL,
    `expenseDate` DATE NOT NULL,
    `carId` INTEGER NULL,
    `categoryId` INTEGER NOT NULL,
    `vendorId` INTEGER NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `paymentMode` ENUM('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER') NOT NULL DEFAULT 'CASH',
    `referenceNo` VARCHAR(80) NULL,
    `billUrl` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `maintenanceId` INTEGER NULL,
    `fuelRecordId` INTEGER NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `expenses_expenseNo_key`(`expenseNo`),
    UNIQUE INDEX `expenses_maintenanceId_key`(`maintenanceId`),
    UNIQUE INDEX `expenses_fuelRecordId_key`(`fuelRecordId`),
    INDEX `expenses_carId_idx`(`carId`),
    INDEX `expenses_categoryId_idx`(`categoryId`),
    INDEX `expenses_expenseDate_idx`(`expenseDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `maintenance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NOT NULL,
    `serviceDate` DATE NOT NULL,
    `km` INTEGER NOT NULL,
    `serviceType` ENUM('GENERAL_SERVICE', 'REPAIR', 'TYRE', 'BATTERY', 'BODY_WORK', 'OTHER') NOT NULL DEFAULT 'GENERAL_SERVICE',
    `vendorId` INTEGER NULL,
    `garageName` VARCHAR(120) NULL,
    `partsCost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `labourCost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `totalCost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `nextServiceKm` INTEGER NULL,
    `nextServiceDate` DATE NULL,
    `billUrl` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `maintenance_carId_idx`(`carId`),
    INDEX `maintenance_serviceDate_idx`(`serviceDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `maintenance_parts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `maintenanceId` INTEGER NOT NULL,
    `partName` VARCHAR(120) NOT NULL,
    `quantity` DECIMAL(10, 2) NOT NULL DEFAULT 1,
    `unitCost` DECIMAL(10, 2) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,

    INDEX `maintenance_parts_maintenanceId_idx`(`maintenanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fuel_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `carId` INTEGER NOT NULL,
    `filledAt` DATE NOT NULL,
    `km` INTEGER NOT NULL,
    `litres` DECIMAL(8, 2) NOT NULL,
    `pricePerLitre` DECIMAL(8, 2) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `station` VARCHAR(120) NULL,
    `isFullTank` BOOLEAN NOT NULL DEFAULT true,
    `billUrl` VARCHAR(255) NULL,
    `recordedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fuel_records_carId_idx`(`carId`),
    INDEX `fuel_records_filledAt_idx`(`filledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `type` VARCHAR(60) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `message` VARCHAR(500) NULL,
    `link` VARCHAR(255) NULL,
    `severity` ENUM('INFO', 'WARNING', 'URGENT') NOT NULL DEFAULT 'INFO',
    `entity` VARCHAR(40) NULL,
    `entityId` INTEGER NULL,
    `dedupeKey` VARCHAR(160) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `notifications_dedupeKey_key`(`dedupeKey`),
    INDEX `notifications_userId_readAt_idx`(`userId`, `readAt`),
    INDEX `notifications_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `action` VARCHAR(60) NOT NULL,
    `entity` VARCHAR(60) NOT NULL,
    `entityId` VARCHAR(40) NULL,
    `summary` VARCHAR(255) NULL,
    `oldValue` JSON NULL,
    `newValue` JSON NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_userId_idx`(`userId`),
    INDEX `audit_logs_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(80) NOT NULL,
    `value` TEXT NOT NULL,
    `group` VARCHAR(40) NOT NULL DEFAULT 'general',
    `valueType` VARCHAR(20) NOT NULL DEFAULT 'string',
    `label` VARCHAR(160) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `settings_group_idx`(`group`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `number_sequences` (
    `prefix` VARCHAR(10) NOT NULL,
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`prefix`, `year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_documents` ADD CONSTRAINT `customer_documents_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_notes` ADD CONSTRAINT `customer_notes_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `car_documents` ADD CONSTRAINT `car_documents_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `cars`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `car_images` ADD CONSTRAINT `car_images_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `cars`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `car_damage_records` ADD CONSTRAINT `car_damage_records_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `cars`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `car_damage_records` ADD CONSTRAINT `car_damage_records_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rate_rules` ADD CONSTRAINT `rate_rules_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `cars`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `cars`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_status_history` ADD CONSTRAINT `booking_status_history_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_status_history` ADD CONSTRAINT `booking_status_history_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_handovers` ADD CONSTRAINT `vehicle_handovers_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_handovers` ADD CONSTRAINT `vehicle_handovers_handedOverById_fkey` FOREIGN KEY (`handedOverById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_returns` ADD CONSTRAINT `vehicle_returns_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_returns` ADD CONSTRAINT `vehicle_returns_receivedById_fkey` FOREIGN KEY (`receivedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rental_agreements` ADD CONSTRAINT `rental_agreements_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_receivedById_fkey` FOREIGN KEY (`receivedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_issuedById_fkey` FOREIGN KEY (`issuedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `cars`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `expense_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `vendors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_maintenanceId_fkey` FOREIGN KEY (`maintenanceId`) REFERENCES `maintenance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_fuelRecordId_fkey` FOREIGN KEY (`fuelRecordId`) REFERENCES `fuel_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance` ADD CONSTRAINT `maintenance_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `cars`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance` ADD CONSTRAINT `maintenance_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `vendors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance` ADD CONSTRAINT `maintenance_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_parts` ADD CONSTRAINT `maintenance_parts_maintenanceId_fkey` FOREIGN KEY (`maintenanceId`) REFERENCES `maintenance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fuel_records` ADD CONSTRAINT `fuel_records_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `cars`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fuel_records` ADD CONSTRAINT `fuel_records_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


SET FOREIGN_KEY_CHECKS = 1;

-- ── Seed data ───────────────────────────────────────────────

-- Seed data for Anish Car Rent: permissions, roles, admin login, expense
-- categories and default settings. Import this AFTER the schema file
-- (anish_car_rent_schema.sql) has been imported into an empty database.

START TRANSACTION;

-- Permissions
INSERT INTO `permissions` (`key`, `module`, `action`, `label`) VALUES
('dashboard.view', 'dashboard', 'view', 'View Dashboard'),
('customers.view', 'customers', 'view', 'View Customers'),
('customers.create', 'customers', 'create', 'Create Customers'),
('customers.edit', 'customers', 'edit', 'Edit Customers'),
('customers.delete', 'customers', 'delete', 'Delete Customers'),
('customers.export', 'customers', 'export', 'Export Customers'),
('cars.view', 'cars', 'view', 'View Fleet'),
('cars.create', 'cars', 'create', 'Create Fleet'),
('cars.edit', 'cars', 'edit', 'Edit Fleet'),
('cars.delete', 'cars', 'delete', 'Delete Fleet'),
('cars.export', 'cars', 'export', 'Export Fleet'),
('bookings.view', 'bookings', 'view', 'View Bookings'),
('bookings.create', 'bookings', 'create', 'Create Bookings'),
('bookings.edit', 'bookings', 'edit', 'Edit Bookings'),
('bookings.delete', 'bookings', 'delete', 'Delete Bookings'),
('bookings.approve', 'bookings', 'approve', 'Approve Bookings'),
('returns.view', 'returns', 'view', 'View Returns & Handover'),
('returns.create', 'returns', 'create', 'Create Returns & Handover'),
('returns.edit', 'returns', 'edit', 'Edit Returns & Handover'),
('payments.view', 'payments', 'view', 'View Payments'),
('payments.create', 'payments', 'create', 'Create Payments'),
('payments.edit', 'payments', 'edit', 'Edit Payments'),
('payments.delete', 'payments', 'delete', 'Delete Payments'),
('payments.export', 'payments', 'export', 'Export Payments'),
('expenses.view', 'expenses', 'view', 'View Expenses'),
('expenses.create', 'expenses', 'create', 'Create Expenses'),
('expenses.edit', 'expenses', 'edit', 'Edit Expenses'),
('expenses.delete', 'expenses', 'delete', 'Delete Expenses'),
('expenses.export', 'expenses', 'export', 'Export Expenses'),
('invoices.view', 'invoices', 'view', 'View Invoices'),
('invoices.create', 'invoices', 'create', 'Create Invoices'),
('invoices.edit', 'invoices', 'edit', 'Edit Invoices'),
('invoices.delete', 'invoices', 'delete', 'Delete Invoices'),
('invoices.export', 'invoices', 'export', 'Export Invoices'),
('maintenance.view', 'maintenance', 'view', 'View Maintenance'),
('maintenance.create', 'maintenance', 'create', 'Create Maintenance'),
('maintenance.edit', 'maintenance', 'edit', 'Edit Maintenance'),
('maintenance.delete', 'maintenance', 'delete', 'Delete Maintenance'),
('fuel.view', 'fuel', 'view', 'View Fuel'),
('fuel.create', 'fuel', 'create', 'Create Fuel'),
('fuel.edit', 'fuel', 'edit', 'Edit Fuel'),
('fuel.delete', 'fuel', 'delete', 'Delete Fuel'),
('documents.view', 'documents', 'view', 'View Documents'),
('documents.create', 'documents', 'create', 'Create Documents'),
('documents.edit', 'documents', 'edit', 'Edit Documents'),
('documents.delete', 'documents', 'delete', 'Delete Documents'),
('reports.view', 'reports', 'view', 'View Reports'),
('reports.export', 'reports', 'export', 'Export Reports'),
('analytics.view', 'analytics', 'view', 'View Analytics'),
('notifications.view', 'notifications', 'view', 'View Notifications'),
('notifications.edit', 'notifications', 'edit', 'Edit Notifications'),
('users.view', 'users', 'view', 'View Staff & Users'),
('users.create', 'users', 'create', 'Create Staff & Users'),
('users.edit', 'users', 'edit', 'Edit Staff & Users'),
('users.delete', 'users', 'delete', 'Delete Staff & Users'),
('roles.view', 'roles', 'view', 'View Roles & Permissions'),
('roles.edit', 'roles', 'edit', 'Edit Roles & Permissions'),
('settings.view', 'settings', 'view', 'View Settings'),
('settings.edit', 'settings', 'edit', 'Edit Settings'),
('audit.view', 'audit', 'view', 'View Audit Log'),
('audit.export', 'audit', 'export', 'Export Audit Log');

-- Roles
INSERT INTO `roles` (`id`, `name`, `label`, `description`, `isSystem`, `updatedAt`) VALUES
  (1, 'admin', 'Admin', 'Full access to every module, including settings and users.', true, CURRENT_TIMESTAMP(3)),
  (2, 'staff', 'Staff', 'Day-to-day operations: customers, bookings, returns and payments.', true, CURRENT_TIMESTAMP(3));

-- Admin role: every permission
INSERT INTO `role_permissions` (`roleId`, `permissionId`)
SELECT 1, `id` FROM `permissions`;

-- Staff role: the permissions listed in src/lib/permissions.ts (STAFF_PERMISSIONS)
INSERT INTO `role_permissions` (`roleId`, `permissionId`) VALUES
  (2, 1),
  (2, 2),
  (2, 3),
  (2, 4),
  (2, 7),
  (2, 12),
  (2, 13),
  (2, 14),
  (2, 17),
  (2, 18),
  (2, 19),
  (2, 20),
  (2, 21),
  (2, 30),
  (2, 31),
  (2, 35),
  (2, 39),
  (2, 40),
  (2, 43),
  (2, 44),
  (2, 50),
  (2, 47);

-- Administrator account
INSERT INTO `users` (`staffCode`, `name`, `email`, `passwordHash`, `roleId`, `status`, `joiningDate`, `updatedAt`) VALUES
  ('STF-00001', 'Administrator', 'admin@anishcarrent.com', '$2b$12$x6Do9Rvej1HUhY/AygioxOv8eVCEMe24hDWG3N8xZFT/sdNk4v7AS', 1, 'ACTIVE', CURRENT_DATE(), CURRENT_TIMESTAMP(3));

-- Keeps staff codes continuing from STF-00001 (see src/lib/sequence.ts)
INSERT INTO `number_sequences` (`prefix`, `year`, `lastNumber`) VALUES ('STF', 0, 1);

-- Expense categories
INSERT INTO `expense_categories` (`name`, `isSystem`) VALUES
  ('Fuel', true),
  ('Service', true),
  ('Repair', true),
  ('Tyre', true),
  ('Battery', true),
  ('Insurance', true),
  ('PUC', true),
  ('Challan', true),
  ('EMI', true),
  ('Cleaning', true),
  ('Parking & Toll', true),
  ('Salary', true),
  ('Other', true);

-- Default settings (edit these later from the Settings screen)
INSERT INTO `settings` (`key`, `value`, `group`, `valueType`, `label`, `updatedAt`) VALUES
  ('company.name', 'Anish Car Rent', 'company', 'string', 'Business name', CURRENT_TIMESTAMP(3)),
  ('company.phone', '', 'company', 'string', 'Phone', CURRENT_TIMESTAMP(3)),
  ('company.email', '', 'company', 'string', 'Email', CURRENT_TIMESTAMP(3)),
  ('company.address', '', 'company', 'text', 'Address', CURRENT_TIMESTAMP(3)),
  ('company.gstin', '', 'company', 'string', 'GSTIN', CURRENT_TIMESTAMP(3)),
  ('billing.currency', 'INR', 'billing', 'string', 'Currency', CURRENT_TIMESTAMP(3)),
  ('billing.taxPercent', '0', 'billing', 'number', 'Default tax %', CURRENT_TIMESTAMP(3)),
  ('billing.lateFeePerHour', '200', 'billing', 'number', 'Late return fee per hour', CURRENT_TIMESTAMP(3)),
  ('billing.lateGraceMinutes', '60', 'billing', 'number', 'Late return grace period (minutes)', CURRENT_TIMESTAMP(3)),
  ('billing.invoiceTerms', 'Payment due on return of the vehicle.', 'billing', 'text', 'Invoice terms', CURRENT_TIMESTAMP(3)),
  ('billing.agreementTerms', '1. The hirer must hold a valid driving licence for the whole rental period and must drive the vehicle personally.\n2. The vehicle must be returned on the agreed date and time. Late returns are charged per hour as per the tariff.\n3. Kilometres beyond the included allowance are charged at the agreed extra-km rate.\n4. Fuel is to be returned at the same level as at handover; any shortfall is charged at actual cost.\n5. The hirer is responsible for traffic challans, tolls and parking charges incurred during the rental.\n6. Any damage to the vehicle during the rental is payable by the hirer and may be adjusted against the security deposit.\n7. The security deposit is refunded after the vehicle is returned and inspected, less any dues.\n8. The vehicle must not be used for racing, towing, illegal purposes, or driven under the influence of alcohol or drugs.\n9. Cancellations may attract a cancellation charge as communicated at the time of booking.', 'billing', 'text', 'Rental agreement terms', CURRENT_TIMESTAMP(3)),
  ('reminders.insuranceDays', '30', 'reminders', 'number', 'Insurance reminder (days before)', CURRENT_TIMESTAMP(3)),
  ('reminders.pucDays', '15', 'reminders', 'number', 'PUC reminder (days before)', CURRENT_TIMESTAMP(3)),
  ('reminders.fitnessDays', '30', 'reminders', 'number', 'Fitness reminder (days before)', CURRENT_TIMESTAMP(3)),
  ('reminders.licenceDays', '30', 'reminders', 'number', 'Licence reminder (days before)', CURRENT_TIMESTAMP(3)),
  ('reminders.serviceKm', '500', 'reminders', 'number', 'Service reminder (km before due)', CURRENT_TIMESTAMP(3)),
  ('reminders.serviceDays', '7', 'reminders', 'number', 'Service reminder (days before due date)', CURRENT_TIMESTAMP(3)),
  ('reminders.bookingDays', '1', 'reminders', 'number', 'Pickup reminder (days before)', CURRENT_TIMESTAMP(3));

COMMIT;
