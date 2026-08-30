-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Persona_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "category" TEXT,
    "platform" TEXT,
    "audience" TEXT,
    "contentType" TEXT,
    "goal" TEXT,
    "tone" TEXT,
    "constraints" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "personaId" TEXT,
    CONSTRAINT "Topic_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Topic_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResearchSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "queries" JSONB,
    "result" JSONB,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ResearchSession_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "researchSessionId" TEXT,
    "topicId" TEXT NOT NULL,
    "platform" TEXT,
    "url" TEXT,
    "title" TEXT,
    "author" TEXT,
    "body" TEXT,
    "publishedAt" DATETIME,
    "likes" INTEGER,
    "commentsCount" INTEGER,
    "shares" INTEGER,
    "favorites" INTEGER,
    "views" INTEGER,
    "engagementRate" REAL,
    "keywords" JSONB,
    "emotions" JSONB,
    "contentStructure" JSONB,
    "rawHtml" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Content_researchSessionId_fkey" FOREIGN KEY ("researchSessionId") REFERENCES "ResearchSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Content_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "author" TEXT,
    "text" TEXT NOT NULL,
    "likes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "hookScore" INTEGER,
    "emotionScore" INTEGER,
    "relatabilityScore" INTEGER,
    "noveltyScore" INTEGER,
    "structureScore" INTEGER,
    "shareabilityScore" INTEGER,
    "conflictScore" INTEGER,
    "storyScore" INTEGER,
    "viralScore" INTEGER,
    "controversyScore" INTEGER,
    "utilityScore" INTEGER,
    "reasoning" TEXT,
    "contentStructure" JSONB,
    "emotionCurve" JSONB,
    "strengths" JSONB,
    "weaknesses" JSONB,
    "keyFactors" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentAnalysis_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentAnalysis_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AudienceInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "painPoints" JSONB,
    "emotions" JSONB,
    "questions" JSONB,
    "opinions" JSONB,
    "controversies" JSONB,
    "stories" JSONB,
    "desires" JSONB,
    "fears" JSONB,
    "needs" JSONB,
    "behaviors" JSONB,
    "preferences" JSONB,
    "contentGaps" JSONB,
    "demographics" JSONB,
    "emotionDetails" JSONB,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AudienceInsight_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Angle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coreThesis" TEXT NOT NULL,
    "targetAudience" TEXT,
    "emotion" TEXT,
    "noveltyScore" INTEGER,
    "relatabilityScore" INTEGER,
    "shareabilityScore" INTEGER,
    "risk" TEXT,
    "supportingEvidence" TEXT,
    "keyPoints" JSONB,
    "audienceAppeal" TEXT,
    "estimatedViralScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Angle_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentStrategy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "angleId" TEXT,
    "coreThesis" TEXT NOT NULL,
    "targetEmotion" TEXT,
    "targetAudience" TEXT,
    "hookStrategy" TEXT,
    "contentStructure" JSONB,
    "storyStrategy" TEXT,
    "conflict" TEXT,
    "turningPoint" TEXT,
    "endingStrategy" TEXT,
    "ctaStrategy" TEXT,
    "keyArguments" JSONB,
    "suggestedReferences" JSONB,
    "tone" TEXT,
    "estimatedWordCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentStrategy_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "outline" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "wordCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Draft_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "hookScore" INTEGER,
    "emotionScore" INTEGER,
    "relatabilityScore" INTEGER,
    "noveltyScore" INTEGER,
    "structureScore" INTEGER,
    "readabilityScore" INTEGER,
    "shareabilityScore" INTEGER,
    "platformFitScore" INTEGER,
    "aiStyleScore" INTEGER,
    "utilityScore" INTEGER,
    "emotionalImpactScore" INTEGER,
    "logicalClarityScore" INTEGER,
    "overallScore" INTEGER,
    "strengths" JSONB,
    "issues" JSONB,
    "suggestions" JSONB,
    "emotionalArcAnalysis" JSONB,
    "conclusion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Evaluation_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Evaluation_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Humanization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "aiStyleScore" INTEGER,
    "humanizedScore" INTEGER,
    "changes" JSONB,
    "issues" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Humanization_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Humanization_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StrategyEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "overallScore" INTEGER,
    "grade" TEXT,
    "scores" JSONB,
    "platformFit" INTEGER,
    "strategyConsistency" INTEGER,
    "strengths" JSONB,
    "weaknesses" JSONB,
    "criticalIssues" JSONB,
    "improvementPriorities" JSONB,
    "shareAnalysis" JSONB,
    "aiStyleRisk" INTEGER,
    "authenticityScore" INTEGER,
    "evidenceQuality" INTEGER,
    "confidence" REAL,
    "verdict" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StrategyEvaluation_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StrategyEvaluation_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT,
    "skillId" TEXT,
    "input" JSONB,
    "output" JSONB,
    "model" TEXT,
    "tokens" INTEGER,
    "latency" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Inspiration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceUrl" TEXT,
    "tags" JSONB,
    "category" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Inspiration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserContentArchive" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "platform" TEXT,
    "finalTitle" TEXT NOT NULL,
    "finalContent" TEXT NOT NULL,
    "finalHook" TEXT,
    "refineChanges" JSONB,
    "selectedAngleTitle" TEXT,
    "strategyTone" TEXT,
    "wordCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserContentArchive_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserWritingProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "toneProfile" JSONB,
    "personality" JSONB,
    "languagePatterns" JSONB,
    "preferredTopics" JSONB,
    "preferredStructures" JSONB,
    "hookStyles" JSONB,
    "emotionalTendencies" JSONB,
    "summary" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastDistillAt" DATETIME,
    "distillSampleCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserWritingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Persona_userId_idx" ON "Persona"("userId");

-- CreateIndex
CREATE INDEX "Topic_projectId_idx" ON "Topic"("projectId");

-- CreateIndex
CREATE INDEX "Topic_personaId_idx" ON "Topic"("personaId");

-- CreateIndex
CREATE INDEX "ResearchSession_topicId_idx" ON "ResearchSession"("topicId");

-- CreateIndex
CREATE INDEX "Content_topicId_idx" ON "Content"("topicId");

-- CreateIndex
CREATE INDEX "Content_platform_idx" ON "Content"("platform");

-- CreateIndex
CREATE INDEX "Comment_contentId_idx" ON "Comment"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentAnalysis_contentId_key" ON "ContentAnalysis"("contentId");

-- CreateIndex
CREATE INDEX "ContentAnalysis_topicId_idx" ON "ContentAnalysis"("topicId");

-- CreateIndex
CREATE INDEX "AudienceInsight_topicId_idx" ON "AudienceInsight"("topicId");

-- CreateIndex
CREATE INDEX "Angle_topicId_idx" ON "Angle"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentStrategy_topicId_key" ON "ContentStrategy"("topicId");

-- CreateIndex
CREATE INDEX "ContentStrategy_topicId_idx" ON "ContentStrategy"("topicId");

-- CreateIndex
CREATE INDEX "Draft_topicId_idx" ON "Draft"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_draftId_key" ON "Evaluation"("draftId");

-- CreateIndex
CREATE INDEX "Evaluation_topicId_idx" ON "Evaluation"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "Humanization_draftId_key" ON "Humanization"("draftId");

-- CreateIndex
CREATE INDEX "Humanization_topicId_idx" ON "Humanization"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyEvaluation_draftId_key" ON "StrategyEvaluation"("draftId");

-- CreateIndex
CREATE INDEX "StrategyEvaluation_topicId_idx" ON "StrategyEvaluation"("topicId");

-- CreateIndex
CREATE INDEX "AgentRun_topicId_idx" ON "AgentRun"("topicId");

-- CreateIndex
CREATE INDEX "AgentRun_skillId_idx" ON "AgentRun"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE INDEX "Inspiration_userId_idx" ON "Inspiration"("userId");

-- CreateIndex
CREATE INDEX "Inspiration_category_idx" ON "Inspiration"("category");

-- CreateIndex
CREATE INDEX "UserContentArchive_userId_idx" ON "UserContentArchive"("userId");

-- CreateIndex
CREATE INDEX "UserContentArchive_platform_idx" ON "UserContentArchive"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "UserWritingProfile_userId_key" ON "UserWritingProfile"("userId");
