import { describe, it, expect } from 'vitest'
import {
  ACTIVE_DRAFT_CHANNEL,
  ACTIVE_DRAFT_CHANGED_TYPE,
  generateSourceId,
  createActiveDraftChangeMessage,
  isValidActiveDraftMessage,
  shouldAcceptActiveDraftMessage,
  ActiveDraftChangeMessage,
} from '../active-draft-sync-utils'

describe('active-draft-sync-utils', () => {
  describe('Test A: Constants', () => {
    it('ACTIVE_DRAFT_CHANNEL should be the expected namespace', () => {
      expect(ACTIVE_DRAFT_CHANNEL).toBe('contentos:active-draft')
    })

    it('ACTIVE_DRAFT_CHANGED_TYPE should be the expected string', () => {
      expect(ACTIVE_DRAFT_CHANGED_TYPE).toBe('ACTIVE_DRAFT_CHANGED')
    })
  })

  describe('Test B: generateSourceId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateSourceId()
      const id2 = generateSourceId()
      expect(id1).not.toBe(id2)
    })

    it('should return a string', () => {
      expect(typeof generateSourceId()).toBe('string')
    })

    it('should return a non-empty string', () => {
      expect(generateSourceId().length).toBeGreaterThan(0)
    })
  })

  describe('Test C: createActiveDraftChangeMessage', () => {
    it('should create a valid message with all correct fields', () => {
      const before = Date.now()
      const msg = createActiveDraftChangeMessage({
        topicId: 'topic-1',
        draftId: 'draft-1',
        sourceId: 'source-1',
      })
      const after = Date.now()

      expect(msg.type).toBe(ACTIVE_DRAFT_CHANGED_TYPE)
      expect(msg.topicId).toBe('topic-1')
      expect(msg.draftId).toBe('draft-1')
      expect(msg.sourceId).toBe('source-1')
      expect(typeof msg.timestamp).toBe('number')
      expect(msg.timestamp).toBeGreaterThanOrEqual(before)
      expect(msg.timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('Test D: isValidActiveDraftMessage', () => {
    it('should accept a valid message', () => {
      expect(isValidActiveDraftMessage({
        type: 'ACTIVE_DRAFT_CHANGED',
        topicId: 't',
        draftId: 'd',
        sourceId: 's',
        timestamp: Date.now(),
      })).toBe(true)
    })

    it('should reject null', () => {
      expect(isValidActiveDraftMessage(null)).toBe(false)
    })

    it('should reject undefined', () => {
      expect(isValidActiveDraftMessage(undefined)).toBe(false)
    })

    it('should reject non-objects', () => {
      expect(isValidActiveDraftMessage('string')).toBe(false)
      expect(isValidActiveDraftMessage(123)).toBe(false)
      expect(isValidActiveDraftMessage(true)).toBe(false)
    })

    it('should reject wrong type', () => {
      expect(isValidActiveDraftMessage({
        type: 'OTHER_TYPE',
        topicId: 't',
        draftId: 'd',
        sourceId: 's',
        timestamp: 1,
      })).toBe(false)
    })

    it('should reject empty topicId', () => {
      expect(isValidActiveDraftMessage({
        type: 'ACTIVE_DRAFT_CHANGED',
        topicId: '',
        draftId: 'd',
        sourceId: 's',
        timestamp: 1,
      })).toBe(false)
    })

    it('should reject empty draftId', () => {
      expect(isValidActiveDraftMessage({
        type: 'ACTIVE_DRAFT_CHANGED',
        topicId: 't',
        draftId: '',
        sourceId: 's',
        timestamp: 1,
      })).toBe(false)
    })

    it('should reject empty sourceId', () => {
      expect(isValidActiveDraftMessage({
        type: 'ACTIVE_DRAFT_CHANGED',
        topicId: 't',
        draftId: 'd',
        sourceId: '',
        timestamp: 1,
      })).toBe(false)
    })

    it('should reject zero or negative timestamp', () => {
      expect(isValidActiveDraftMessage({
        type: 'ACTIVE_DRAFT_CHANGED',
        topicId: 't',
        draftId: 'd',
        sourceId: 's',
        timestamp: 0,
      })).toBe(false)
      expect(isValidActiveDraftMessage({
        type: 'ACTIVE_DRAFT_CHANGED',
        topicId: 't',
        draftId: 'd',
        sourceId: 's',
        timestamp: -1,
      })).toBe(false)
    })
  })

  describe('Test E: shouldAcceptActiveDraftMessage - wrong-topic', () => {
    it('should reject message from different topic', () => {
      const msg = createActiveDraftChangeMessage({
        topicId: 'topic-A',
        draftId: 'draft-X',
        sourceId: 'source-1',
      })
      const result = shouldAcceptActiveDraftMessage(msg, 'topic-B', 'source-2', 'draft-old', 0)
      expect(result.accept).toBe(false)
      expect(result.reason).toBe('wrong-topic')
    })
  })

  describe('Test F: self-message filter', () => {
    it('should reject self-message', () => {
      const msg = createActiveDraftChangeMessage({
        topicId: 'topic-A',
        draftId: 'draft-X',
        sourceId: 'source-1',
      })
      const result = shouldAcceptActiveDraftMessage(msg, 'topic-A', 'source-1', 'draft-old', 0)
      expect(result.accept).toBe(false)
      expect(result.reason).toBe('self-message')
    })
  })

  describe('Test G: stale message filter', () => {
    it('should reject stale message', () => {
      const msg = createActiveDraftChangeMessage({
        topicId: 'topic-A',
        draftId: 'draft-X',
        sourceId: 'source-2',
      })
      const result = shouldAcceptActiveDraftMessage(msg, 'topic-A', 'source-1', 'draft-old', msg.timestamp)
      expect(result.accept).toBe(false)
      expect(result.reason).toBe('stale')
    })

    it('should accept fresh message', () => {
      const msg = createActiveDraftChangeMessage({
        topicId: 'topic-A',
        draftId: 'draft-X',
        sourceId: 'source-2',
      })
      const result = shouldAcceptActiveDraftMessage(msg, 'topic-A', 'source-1', 'draft-old', msg.timestamp - 1)
      expect(result.accept).toBe(true)
    })
  })

  describe('Test H: no-change filter', () => {
    it('should reject when draftId matches current', () => {
      const msg = createActiveDraftChangeMessage({
        topicId: 'topic-A',
        draftId: 'draft-same',
        sourceId: 'source-2',
      })
      const result = shouldAcceptActiveDraftMessage(msg, 'topic-A', 'source-1', 'draft-same', 0)
      expect(result.accept).toBe(false)
      expect(result.reason).toBe('no-change')
    })
  })
})
