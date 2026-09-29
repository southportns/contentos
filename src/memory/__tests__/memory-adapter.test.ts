/**
 * P0.6.3.1 — Memory Adapter Tests
 *
 * Tests for all 5 concrete adapters.
 */

import { describe, it, expect } from 'vitest';
import {
  writingProfileAdapter,
  WritingProfileInput,
  contentArchiveAdapter,
  ContentArchiveInput,
  personaAdapter,
  PersonaInput,
  draftAdapter,
  DraftInput,
  agentRunAdapter,
  AgentRunInput,
} from '../adapters';

describe('Memory Adapters', () => {
  // ─── Writing Profile Adapter ────────────────────────────────────────────────

  describe('writingProfileAdapter', () => {
    const validProfile: WritingProfileInput = {
      id: 'wp-1',
      userId: 'user-1',
      toneProfile: { formality: 0.7 },
      personality: ['rational'],
      summary: 'Test user profile',
      version: 1,
      distillSampleCount: 10,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-15T00:00:00Z',
    };

    it('should adapt a valid writing profile (normal input)', () => {
      const record = writingProfileAdapter.adapt(validProfile);
      expect(record.id).toBe('mem_wp_wp-1');
      expect(record.kind).toBe('static');
      expect(record.type).toBe('writing_profile');
      expect(record.source).toBe('user_writing_profile:wp-1');
      expect(record.sourceType).toBe('user_writing_profile');
      expect(record.ownerId).toBe('user-1');
      expect(record.version).toBe(1);
      expect(record.payload.summary).toBe('Test user profile');
      expect(record.payload.distillSampleCount).toBe(10);
    });

    it('should default scope to global', () => {
      const record = writingProfileAdapter.adapt(validProfile);
      expect(record.scope).toBe('global');
    });

    it('should set provenance correctly', () => {
      const record = writingProfileAdapter.adapt(validProfile, {
        ownerId: 'override-user',
        confidence: 0.95,
      });
      expect(record.ownerId).toBe('override-user');
      expect(record.confidence).toBe(0.95);
      expect(record.provenance).toBeUndefined(); // adapter doesn't set runtime provenance
    });

    it('should respect explicit scope override', () => {
      const record = writingProfileAdapter.adapt(validProfile, {
        scope: 'project',
        projectId: 'proj-1',
      });
      expect(record.scope).toBe('project');
    });
  });

  // ─── Content Archive Adapter ────────────────────────────────────────────────

  describe('contentArchiveAdapter', () => {
    const validArchive: ContentArchiveInput = {
      id: 'ca-1',
      userId: 'user-1',
      topic: '如何提升写作技巧',
      platform: 'xiaohongshu',
      finalTitle: '写作的5个秘诀',
      finalContent: '内容...',
      finalHook: '你知道吗？',
      draftVersion: 2,
      wordCount: 1500,
      createdAt: '2026-02-01T00:00:00Z',
    };

    it('should adapt a content archive (normal input)', () => {
      const record = contentArchiveAdapter.adapt(validArchive);
      expect(record.id).toBe('mem_ca_ca-1');
      expect(record.kind).toBe('episodic');
      expect(record.type).toBe('content_archive');
      expect(record.source).toBe('user_content_archive:ca-1');
      expect(record.sourceType).toBe('user_content_archive');
      expect(record.ownerId).toBe('user-1');
      expect(record.payload.topic).toBe('如何提升写作技巧');
      expect(record.payload.draftVersion).toBe(2);
      expect(record.payload.platform).toBe('xiaohongshu');
    });

    it('should default scope to global', () => {
      const record = contentArchiveAdapter.adapt(validArchive);
      expect(record.scope).toBe('global');
    });

    it('should set provenance correctly', () => {
      const record = contentArchiveAdapter.adapt(validArchive, {
        ownerId: 'override-user',
        confidence: 0.9,
      });
      expect(record.ownerId).toBe('override-user');
      expect(record.confidence).toBe(0.9);
    });
  });

  // ─── Persona Adapter ────────────────────────────────────────────────────────

  describe('personaAdapter', () => {
    const validPersona: PersonaInput = {
      id: 'persona-1',
      userId: 'user-1',
      name: '创作者小明',
      description: '专注于科技领域的内容创作者',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-10T00:00:00Z',
    };

    it('should adapt a persona (normal input)', () => {
      const record = personaAdapter.adapt(validPersona);
      expect(record.id).toBe('mem_persona_persona-1');
      expect(record.kind).toBe('static');
      expect(record.type).toBe('persona');
      expect(record.source).toBe('persona:persona-1');
      expect(record.sourceType).toBe('persona');
      expect(record.ownerId).toBe('user-1');
      expect(record.payload.name).toBe('创作者小明');
      expect(record.payload.isActive).toBe(true);
    });

    it('should default scope to global', () => {
      const record = personaAdapter.adapt(validPersona);
      expect(record.scope).toBe('global');
    });

    it('should set provenance correctly', () => {
      const record = personaAdapter.adapt(validPersona, {
        ownerId: 'other-user',
        importance: 0.8,
      });
      expect(record.ownerId).toBe('other-user');
      expect(record.importance).toBe(0.8);
    });
  });

  // ─── Draft Adapter ──────────────────────────────────────────────────────────

  describe('draftAdapter', () => {
    const validDraft: DraftInput = {
      id: 'draft-1',
      topicId: 'topic-1',
      version: 3,
      parentDraftId: 'draft-0',
      changeType: 'MANUAL_EDIT',
      changeReason: 'User refined title',
      title: '新的标题',
      content: '内容...',
      status: 'DRAFT',
      wordCount: 800,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-15T00:00:00Z',
    };

    it('should adapt a draft (normal input)', () => {
      const record = draftAdapter.adapt(validDraft);
      expect(record.id).toBe('mem_draft_draft-1');
      expect(record.kind).toBe('dynamic');
      expect(record.type).toBe('draft');
      expect(record.source).toBe('draft:draft-1');
      expect(record.sourceType).toBe('draft');
      expect(record.topicId).toBe('topic-1');
      expect(record.version).toBe(3);
      expect(record.payload.title).toBe('新的标题');
      expect(record.payload.changeType).toBe('MANUAL_EDIT');
    });

    it('should default scope to topic', () => {
      const record = draftAdapter.adapt(validDraft);
      expect(record.scope).toBe('topic');
    });

    it('should set provenance correctly', () => {
      const record = draftAdapter.adapt(validDraft, {
        projectId: 'proj-1',
        ownerId: 'user-1',
      });
      expect(record.projectId).toBe('proj-1');
      expect(record.ownerId).toBe('user-1');
    });

    it('should include derivedFrom when parentDraftId exists', () => {
      const record = draftAdapter.adapt(validDraft);
      expect(record.derivedFrom).toEqual(['draft-0']);
    });

    // ─── P0.6.3.1-R1: Draft Scope Inference ───────────────────────────────────

    it('Case A: topicId=T1 + projectId=P1 + scope=undefined → topic', () => {
      const draft: DraftInput = { ...validDraft, topicId: 'T1', projectId: 'P1' };
      const record = draftAdapter.adapt(draft);
      expect(record.scope).toBe('topic');
    });

    it('Case B: topicId=null + projectId=P1 + scope=undefined → project', () => {
      const draft: DraftInput = { ...validDraft, topicId: null, projectId: 'P1' };
      const record = draftAdapter.adapt(draft);
      expect(record.scope).toBe('project');
    });

    it('Case C: topicId=null + projectId=null + scope=undefined → global', () => {
      const draft: DraftInput = { ...validDraft, topicId: null, projectId: null };
      const record = draftAdapter.adapt(draft);
      expect(record.scope).toBe('global');
    });

    it('Case D: explicit scope=global overrides topicId=T1 + projectId=P1', () => {
      const draft: DraftInput = { ...validDraft, topicId: 'T1', projectId: 'P1' };
      const record = draftAdapter.adapt(draft, { scope: 'global' });
      expect(record.scope).toBe('global');
    });
  });

  // ─── Agent Run Adapter ─────────────────────────────────────────────────────

  describe('agentRunAdapter', () => {
    const validAgentRun: AgentRunInput = {
      id: 'ar-1',
      topicId: 'topic-1',
      skillId: 'writing-v2',
      status: 'completed',
      model: 'deepseek-v3',
      tokens: 1500,
      latency: 2300,
      startedAt: '2026-04-01T10:00:00Z',
      completedAt: '2026-04-01T10:02:30Z',
      createdAt: '2026-04-01T10:00:00Z',
    };

    it('should adapt an agent run (normal input)', () => {
      const record = agentRunAdapter.adapt(validAgentRun);
      expect(record.id).toBe('mem_ar_ar-1');
      expect(record.kind).toBe('episodic');
      expect(record.type).toBe('agent_run');
      expect(record.source).toBe('agent_run:ar-1');
      expect(record.sourceType).toBe('agent_run');
      expect(record.topicId).toBe('topic-1');
      expect(record.payload.skillId).toBe('writing-v2');
      expect(record.payload.tokens).toBe(1500);
      expect(record.payload.latency).toBe(2300);
    });

    it('should derive scope from topicId', () => {
      const record = agentRunAdapter.adapt(validAgentRun);
      expect(record.scope).toBe('topic'); // has topicId
    });

    it('should derive scope from projectId when no topicId', () => {
      const run: AgentRunInput = {
        ...validAgentRun,
        topicId: null,
      };
      const record = agentRunAdapter.adapt(run, { projectId: 'proj-1' });
      expect(record.scope).toBe('project');
    });

    it('should default to global when no topicId or projectId', () => {
      const run: AgentRunInput = {
        ...validAgentRun,
        topicId: null,
      };
      const record = agentRunAdapter.adapt(run);
      expect(record.scope).toBe('global');
    });

    it('should set provenance correctly', () => {
      const record = agentRunAdapter.adapt(validAgentRun, {
        ownerId: 'user-1',
        confidence: 0.99,
      });
      expect(record.ownerId).toBe('user-1');
      expect(record.confidence).toBe(0.99);
    });

    it('should handle completed status with high confidence', () => {
      const record = agentRunAdapter.adapt(validAgentRun);
      expect(record.confidence).toBe(0.9); // default for completed
    });

    it('should handle pending status with lower confidence', () => {
      const run: AgentRunInput = {
        ...validAgentRun,
        status: 'pending',
      };
      const record = agentRunAdapter.adapt(run);
      expect(record.confidence).toBe(0.5); // default for non-completed
    });
  });
});
