-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "summarizedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "summary" TEXT;
