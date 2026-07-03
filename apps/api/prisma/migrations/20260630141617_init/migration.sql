-- CreateEnum
CREATE TYPE "RepositoryStatus" AS ENUM ('PENDING', 'EXTRACTING', 'SCANNING', 'ANALYZING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportKind" AS ENUM ('DEFAULT', 'NAMED');

-- CreateEnum
CREATE TYPE "GraphEdgeKind" AS ENUM ('RENDERS');

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RepositoryStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "storagePath" TEXT NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "componentCount" INTEGER NOT NULL DEFAULT 0,
    "hookCount" INTEGER NOT NULL DEFAULT 0,
    "routeCount" INTEGER NOT NULL DEFAULT 0,
    "totalLines" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "lineCount" INTEGER NOT NULL,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Component" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exportKind" "ExportKind" NOT NULL DEFAULT 'NAMED',
    "isExported" BOOLEAN NOT NULL DEFAULT false,
    "startLine" INTEGER NOT NULL,
    "endLine" INTEGER NOT NULL,
    "importedByCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hook" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isExported" BOOLEAN NOT NULL DEFAULT false,
    "startLine" INTEGER NOT NULL,
    "endLine" INTEGER NOT NULL,

    CONSTRAINT "Hook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "componentName" TEXT,
    "filePath" TEXT NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentEdge" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "kind" "GraphEdgeKind" NOT NULL DEFAULT 'RENDERS',

    CONSTRAINT "ComponentEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Repository_status_idx" ON "Repository"("status");

-- CreateIndex
CREATE INDEX "File_repositoryId_idx" ON "File"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "File_repositoryId_path_key" ON "File"("repositoryId", "path");

-- CreateIndex
CREATE INDEX "Component_repositoryId_idx" ON "Component"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Component_repositoryId_name_fileId_key" ON "Component"("repositoryId", "name", "fileId");

-- CreateIndex
CREATE INDEX "Hook_repositoryId_idx" ON "Hook"("repositoryId");

-- CreateIndex
CREATE INDEX "Route_repositoryId_idx" ON "Route"("repositoryId");

-- CreateIndex
CREATE INDEX "ComponentEdge_repositoryId_idx" ON "ComponentEdge"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentEdge_sourceId_targetId_kind_key" ON "ComponentEdge"("sourceId", "targetId", "kind");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hook" ADD CONSTRAINT "Hook_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hook" ADD CONSTRAINT "Hook_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentEdge" ADD CONSTRAINT "ComponentEdge_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentEdge" ADD CONSTRAINT "ComponentEdge_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentEdge" ADD CONSTRAINT "ComponentEdge_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;
