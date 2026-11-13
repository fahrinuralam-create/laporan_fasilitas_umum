-- Additive migration: pengajuan penautan Telegram dengan verifikasi admin.
-- Tabel lama (telegramlinktoken, kolom user.telegramChatId, dll.) tidak diubah.

CREATE TABLE `telegramlinkrequest` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(32) NOT NULL,
  `phoneNormalized` VARCHAR(32) NOT NULL,
  `previousPhoneNormalized` VARCHAR(32) NULL,
  `requestType` VARCHAR(20) NOT NULL DEFAULT 'INITIAL',
  `status` ENUM('PENDING_ADMIN', 'PENDING_TELEGRAM', 'ACTIVE', 'REJECTED', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'PENDING_ADMIN',
  `telegramUserId` VARCHAR(32) NULL,
  `telegramChatId` VARCHAR(32) NULL,
  `telegramUsername` VARCHAR(191) NULL,
  `candidateTelegramUserId` VARCHAR(32) NULL,
  `candidateTelegramChatId` VARCHAR(32) NULL,
  `candidateUsername` VARCHAR(191) NULL,
  `confirmationStartedAt` DATETIME(3) NULL,
  `tokenHash` VARCHAR(64) NULL,
  `tokenExpiresAt` DATETIME(3) NULL,
  `tokenUsedAt` DATETIME(3) NULL,
  `confirmedAt` DATETIME(3) NULL,
  `reviewedById` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `rejectionReason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `TelegramLinkRequest_tokenHash_key`(`tokenHash`),
  INDEX `TelegramLinkRequest_userId_idx`(`userId`),
  INDEX `TelegramLinkRequest_status_idx`(`status`),
  INDEX `TelegramLinkRequest_phoneNormalized_idx`(`phoneNormalized`),
  INDEX `TelegramLinkRequest_telegramChatId_idx`(`telegramChatId`),
  INDEX `TelegramLinkRequest_createdAt_idx`(`createdAt`),
  INDEX `TelegramLinkRequest_reviewedById_idx`(`reviewedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `telegramlinkrequest`
  ADD CONSTRAINT `TelegramLinkRequest_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `telegramlinkrequest`
  ADD CONSTRAINT `TelegramLinkRequest_reviewedById_fkey`
  FOREIGN KEY (`reviewedById`) REFERENCES `user`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
