/**
 * Security Rules Verification Specification for /seals/{sealId}
 * Verifies that all Dirty Dozen attack vectors are denied by firestore.rules.
 */

export interface SealPayload {
  id: unknown;
  name: unknown;
  question: unknown;
  hint: unknown;
  instructions: unknown;
  sealedEnvelope: unknown;
  createdAtIso: unknown;
  [key: string]: unknown;
}

export const dirtyDozenPayloads: { name: string; operation: 'create' | 'update' | 'delete' | 'list'; pathId: string; payload?: Partial<SealPayload> }[] = [
  {
    name: '1. Shadow Field Injection',
    operation: 'create',
    pathId: 'seal_valid_123456',
    payload: {
      id: 'seal_valid_123456',
      name: 'Thiên Ấn 1',
      question: 'Câu hỏi là gì?',
      hint: 'Gợi ý',
      instructions: 'Viết thường',
      sealedEnvelope: 'v1:encrypted_envelope_payload_data_12345',
      createdAtIso: '2026-11-17T00:00:00.000Z',
      shadowField: 'malicious'
    }
  },
  {
    name: '2. Path ID Mismatch',
    operation: 'create',
    pathId: 'seal_valid_123456',
    payload: {
      id: 'different_id_999999',
      name: 'Thiên Ấn 1',
      question: 'Câu hỏi là gì?',
      hint: '',
      instructions: '',
      sealedEnvelope: 'v1:encrypted_envelope_payload_data_12345',
      createdAtIso: '2026-11-17T00:00:00.000Z'
    }
  },
  {
    name: '3. Oversized Name (> 200 chars)',
    operation: 'create',
    pathId: 'seal_valid_123456',
    payload: {
      id: 'seal_valid_123456',
      name: 'A'.repeat(201),
      question: 'Câu hỏi là gì?',
      hint: '',
      instructions: '',
      sealedEnvelope: 'v1:encrypted_envelope_payload_data_12345',
      createdAtIso: '2026-11-17T00:00:00.000Z'
    }
  },
  {
    name: '4. Oversized Question (> 5000 chars)',
    operation: 'create',
    pathId: 'seal_valid_123456',
    payload: {
      id: 'seal_valid_123456',
      name: 'Thiên Ấn',
      question: 'Q'.repeat(5001),
      hint: '',
      instructions: '',
      sealedEnvelope: 'v1:encrypted_envelope_payload_data_12345',
      createdAtIso: '2026-11-17T00:00:00.000Z'
    }
  },
  {
    name: '5. Empty Question',
    operation: 'create',
    pathId: 'seal_valid_123456',
    payload: {
      id: 'seal_valid_123456',
      name: 'Thiên Ấn',
      question: '',
      hint: '',
      instructions: '',
      sealedEnvelope: 'v1:encrypted_envelope_payload_data_12345',
      createdAtIso: '2026-11-17T00:00:00.000Z'
    }
  },
  {
    name: '6. Non-string Hint',
    operation: 'create',
    pathId: 'seal_valid_123456',
    payload: {
      id: 'seal_valid_123456',
      name: 'Thiên Ấn',
      question: 'Câu hỏi?',
      hint: 12345,
      instructions: '',
      sealedEnvelope: 'v1:encrypted_envelope_payload_data_12345',
      createdAtIso: '2026-11-17T00:00:00.000Z'
    }
  },
  {
    name: '7. Non-string Instructions',
    operation: 'create',
    pathId: 'seal_valid_123456',
    payload: {
      id: 'seal_valid_123456',
      name: 'Thiên Ấn',
      question: 'Câu hỏi?',
      hint: '',
      instructions: ['invalid'],
      sealedEnvelope: 'v1:encrypted_envelope_payload_data_12345',
      createdAtIso: '2026-11-17T00:00:00.000Z'
    }
  },
  {
    name: '8. Missing sealedEnvelope',
    operation: 'create',
    pathId: 'seal_valid_123456',
    payload: {
      id: 'seal_valid_123456',
      name: 'Thiên Ấn',
      question: 'Câu hỏi?',
      hint: '',
      instructions: '',
      createdAtIso: '2026-11-17T00:00:00.000Z'
    }
  },
  {
    name: '9. Invalid short sealedEnvelope',
    operation: 'create',
    pathId: 'seal_valid_123456',
    payload: {
      id: 'seal_valid_123456',
      name: 'Thiên Ấn',
      question: 'Câu hỏi?',
      hint: '',
      instructions: '',
      sealedEnvelope: 'tiny',
      createdAtIso: '2026-11-17T00:00:00.000Z'
    }
  },
  {
    name: '10. Unauthorized Update Attempt',
    operation: 'update',
    pathId: 'seal_valid_123456',
    payload: {
      name: 'Hacked Name'
    }
  },
  {
    name: '11. Unauthorized Delete Attempt',
    operation: 'delete',
    pathId: 'seal_valid_123456'
  },
  {
    name: '12. Unauthorized Collection List Scraping',
    operation: 'list',
    pathId: ''
  }
];
