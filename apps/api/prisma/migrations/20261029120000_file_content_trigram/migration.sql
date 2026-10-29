-- search_code runs ILIKE '%query%' over File.content. A trigram GIN index lets
-- Postgres answer that without reading every file's source.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "File_content_idx" ON "File" USING GIN ("content" gin_trgm_ops);
