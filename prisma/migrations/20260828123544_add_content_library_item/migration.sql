-- CreateTable
CREATE TABLE "ContentLibraryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'default',
    "platform" TEXT NOT NULL DEFAULT 'web',
    "url" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "author" TEXT,
    "cover" TEXT,
    "publishedAt" TEXT,
    "likes" INTEGER,
    "commentsCount" INTEGER,
    "shares" INTEGER,
    "favorites" INTEGER,
    "views" INTEGER,
    "transcript" JSONB,
    "collectedComments" JSONB,
    "commentAnalysis" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContentAdaptation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "referencePlatform" TEXT,
    "referenceUrl" TEXT,
    "referenceTitle" TEXT,
    "referenceAuthor" TEXT,
    "referenceContent" TEXT,
    "referenceMetrics" JSONB,
    "userIdea" TEXT,
    "personaId" TEXT,
    "referenceAnalysis" JSONB,
    "adaptedAngles" JSONB,
    "strategySuggestion" JSONB,
    "selectedAngleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentAdaptation_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ContentLibraryItem_userId_idx" ON "ContentLibraryItem"("userId");

-- CreateIndex
CREATE INDEX "ContentLibraryItem_platform_idx" ON "ContentLibraryItem"("platform");

-- CreateIndex
CREATE INDEX "ContentAdaptation_topicId_idx" ON "ContentAdaptation"("topicId");
