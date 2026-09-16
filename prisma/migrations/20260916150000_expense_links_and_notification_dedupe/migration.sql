-- AlterTable
ALTER TABLE `expenses` ADD COLUMN `fuelRecordId` INTEGER NULL,
    ADD COLUMN `maintenanceId` INTEGER NULL;

-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `dedupeKey` VARCHAR(160) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `expenses_maintenanceId_key` ON `expenses`(`maintenanceId`);

-- CreateIndex
CREATE UNIQUE INDEX `expenses_fuelRecordId_key` ON `expenses`(`fuelRecordId`);

-- CreateIndex
CREATE UNIQUE INDEX `notifications_dedupeKey_key` ON `notifications`(`dedupeKey`);

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_maintenanceId_fkey` FOREIGN KEY (`maintenanceId`) REFERENCES `maintenance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_fuelRecordId_fkey` FOREIGN KEY (`fuelRecordId`) REFERENCES `fuel_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
