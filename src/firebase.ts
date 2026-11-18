import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  setDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

export interface SealFirestoreRecord {
  id: string;
  name: string;
  question: string;
  hint: string;
  instructions: string;
  sealedEnvelope: string;
  createdAtIso: string;
}

/**
 * Ensures the encrypted seal record is persisted in Cloud Firestore (/seals/{id}).
 * Payload constraints strictly match firebase-blueprint.json and firestore.rules.
 */
export async function persistEncryptedSealToFirestore(
  record: SealFirestoreRecord
): Promise<void> {
  const path = `seals/${record.id}`;
  const sanitized: SealFirestoreRecord = {
    id: String(record.id).slice(0, 64),
    name: String(record.name).slice(0, 200),
    question: String(record.question).slice(0, 5000),
    hint: String(record.hint ?? '').slice(0, 3000),
    instructions: String(record.instructions ?? '').slice(0, 3000),
    sealedEnvelope: String(record.sealedEnvelope).slice(0, 50000),
    createdAtIso: String(record.createdAtIso).slice(0, 40),
  };

  try {
    await setDoc(doc(db, 'seals', sanitized.id), sanitized);
  } catch (error) {
    // If already created by backend server, ignore permission error on duplicate create
    const existing = await getDoc(doc(db, 'seals', sanitized.id)).catch(
      () => null
    );
    if (existing && existing.exists()) {
      return;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Reads an encrypted seal record from Cloud Firestore (/seals/{id}) if needed.
 */
export async function fetchEncryptedSealFromFirestore(
  sealId: string
): Promise<SealFirestoreRecord | null> {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(sealId)) {
    return null;
  }
  const path = `seals/${sealId}`;
  try {
    const snap = await getDoc(doc(db, 'seals', sealId));
    if (!snap.exists()) {
      return null;
    }
    return snap.data() as SealFirestoreRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}
