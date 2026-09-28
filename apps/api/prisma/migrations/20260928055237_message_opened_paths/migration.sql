-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "openedPaths" TEXT[] DEFAULT ARRAY[]::TEXT[];
