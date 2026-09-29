/**
 * P0.6.3.1 — Memory Adapters barrel export
 */

export { writingProfileAdapter } from './writing-profile-adapter';
export type { WritingProfileInput, WritingProfilePayload } from './writing-profile-adapter';

export { contentArchiveAdapter } from './content-archive-adapter';
export type { ContentArchiveInput, ContentArchivePayload } from './content-archive-adapter';

export { personaAdapter } from './persona-adapter';
export type { PersonaInput, PersonaPayload } from './persona-adapter';

export { draftAdapter } from './draft-adapter';
export type { DraftInput, DraftPayload } from './draft-adapter';

export { agentRunAdapter } from './agent-run-adapter';
export type { AgentRunInput, AgentRunPayload } from './agent-run-adapter';
