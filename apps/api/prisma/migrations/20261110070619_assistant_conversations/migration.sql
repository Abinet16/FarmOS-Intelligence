-- DropIndex
DROP INDEX "ai_conversations_organization_id_user_id_created_at_idx";

-- AlterTable
ALTER TABLE "ai_conversations" ADD COLUMN     "title" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "ai_conversations_organization_id_user_id_updated_at_idx" ON "ai_conversations"("organization_id", "user_id", "updated_at");


-- Bounded text: a question is at most 1,000 characters and an answer 4,000,
-- so anything far larger means a bug, not a long conversation.
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_title_length_check"
  CHECK (char_length("title") <= 120);
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_content_length_check"
  CHECK (char_length("content") BETWEEN 1 AND 8000);
