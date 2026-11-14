-- Migrasi kanal notifikasi eksternal: Telegram -> WhatsApp (Fonnte).
-- Data pengguna, laporan, riwayat, foto, dan notifikasi internal TIDAK dihapus.
-- Yang dihapus hanya metadata/penautan khusus Telegram yang sudah tidak dipakai.

-- 1. Buang foreign key tabel Telegram sebelum tabelnya dihapus.
ALTER TABLE `telegramlinkrequest` DROP FOREIGN KEY `TelegramLinkRequest_reviewedById_fkey`;
ALTER TABLE `telegramlinkrequest` DROP FOREIGN KEY `TelegramLinkRequest_userId_fkey`;
ALTER TABLE `telegramlinktoken` DROP FOREIGN KEY `TelegramLinkToken_userId_fkey`;

-- 2. Hapus index unik identitas Telegram pada tabel user.
DROP INDEX `User_telegramChatId_key` ON `user`;

-- 3. Ganti metadata pengiriman eksternal pada notification.
--    Baris notifikasi internal tetap utuh; hanya status kanal lama diganti.
ALTER TABLE `notification`
    DROP COLUMN `telegramError`,
    DROP COLUMN `telegramSent`,
    DROP COLUMN `telegramSentAt`,
    ADD COLUMN `whatsappAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `whatsappError` TEXT NULL,
    ADD COLUMN `whatsappMessageId` VARCHAR(100) NULL,
    ADD COLUMN `whatsappProcessingAt` DATETIME(3) NULL,
    ADD COLUMN `whatsappSent` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `whatsappSentAt` DATETIME(3) NULL;

-- 4. Ganti kolom penautan Telegram pada user dengan kolom WhatsApp.
--    Nomor WhatsApp baru dianggap aktif hanya setelah OTP terverifikasi.
ALTER TABLE `user`
    DROP COLUMN `telegramChatId`,
    DROP COLUMN `telegramEnabled`,
    DROP COLUMN `telegramLinkedAt`,
    DROP COLUMN `telegramUsername`,
    ADD COLUMN `whatsappEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `whatsappLinkedAt` DATETIME(3) NULL,
    ADD COLUMN `whatsappNumber` VARCHAR(32) NULL,
    ADD COLUMN `whatsappVerifiedAt` DATETIME(3) NULL;

-- 5. Hapus tabel khusus Telegram (sudah tidak direferensikan fitur lain).
DROP TABLE `telegramlinkrequest`;
DROP TABLE `telegramlinktoken`;

-- 6. Tabel pengajuan penautan WhatsApp dengan OTP.
CREATE TABLE `whatsapplinkrequest` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `phoneNormalized` VARCHAR(32) NOT NULL,
    `previousPhoneNormalized` VARCHAR(32) NULL,
    `requestType` VARCHAR(20) NOT NULL DEFAULT 'INITIAL',
    `status` ENUM('PENDING_ADMIN', 'PENDING_VERIFICATION', 'ACTIVE', 'REJECTED', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'PENDING_ADMIN',
    `otpHash` VARCHAR(64) NULL,
    `otpExpiresAt` DATETIME(3) NULL,
    `otpUsedAt` DATETIME(3) NULL,
    `otpAttempts` INTEGER NOT NULL DEFAULT 0,
    `otpSentAt` DATETIME(3) NULL,
    `otpSendError` TEXT NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectionReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WhatsAppLinkRequest_userId_idx`(`userId`),
    INDEX `WhatsAppLinkRequest_status_idx`(`status`),
    INDEX `WhatsAppLinkRequest_phoneNormalized_idx`(`phoneNormalized`),
    INDEX `WhatsAppLinkRequest_createdAt_idx`(`createdAt`),
    INDEX `WhatsAppLinkRequest_reviewedById_idx`(`reviewedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `User_whatsappNumber_key` ON `user`(`whatsappNumber`);

ALTER TABLE `whatsapplinkrequest`
    ADD CONSTRAINT `WhatsAppLinkRequest_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `user`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `whatsapplinkrequest`
    ADD CONSTRAINT `WhatsAppLinkRequest_reviewedById_fkey`
    FOREIGN KEY (`reviewedById`) REFERENCES `user`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
