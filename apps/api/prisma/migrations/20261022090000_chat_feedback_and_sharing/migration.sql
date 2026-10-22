-- Per-answer reader feedback, so there is a signal about which answers land.
ALTER TABLE "Message" ADD COLUMN     "feedback" INTEGER;
ALTER TABLE "Message" ADD COLUMN     "feedbackNote" TEXT;

-- Follow-up questions the model proposed alongside the answer. Persisted so the
-- chips survive a reload like every other part of the thread.
ALTER TABLE "Message" ADD COLUMN     "followUps" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Set when the answer hit the token ceiling, so the thread can offer to resume
-- it instead of printing a note telling the reader to ask.
ALTER TABLE "Message" ADD COLUMN     "truncated" BOOLEAN NOT NULL DEFAULT false;

-- Opt-in read-only sharing for a single conversation. Null means private, which
-- is every conversation until its owner mints a token.
ALTER TABLE "Conversation" ADD COLUMN     "shareToken" TEXT;
CREATE UNIQUE INDEX "Conversation_shareToken_key" ON "Conversation"("shareToken");
