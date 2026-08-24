-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "deletedForAll" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "forwarded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "message_reactions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT,
    "clientId" TEXT,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_stars" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_stars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_states" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "pinnedAt" TIMESTAMP(3),
    "mutedUntil" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "conversation_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_reactions_messageId_idx" ON "message_reactions"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "message_reactions_messageId_userId_clientId_key" ON "message_reactions"("messageId", "userId", "clientId");

-- CreateIndex
CREATE INDEX "message_stars_userId_idx" ON "message_stars"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "message_stars_messageId_userId_key" ON "message_stars"("messageId", "userId");

-- CreateIndex
CREATE INDEX "conversation_states_userId_idx" ON "conversation_states"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_states_conversationId_userId_key" ON "conversation_states"("conversationId", "userId");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_stars" ADD CONSTRAINT "message_stars_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_states" ADD CONSTRAINT "conversation_states_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
