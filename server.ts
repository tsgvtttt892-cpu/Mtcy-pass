import crypto from 'crypto';
import express from 'express';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import fs from 'fs';
import { argon2id, argon2Verify } from 'hash-wasm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase config for server-side Firestore sync
const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const firestoreDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Server-side master wrapping key (deterministic per environment so envelopes stay decryptable across restarts)
const SERVER_MASTER_SECRET = crypto
  .createHash('sha256')
  .update(
    `thien-an-celestial-seal-key::${firebaseConfig.projectId}::${firebaseConfig.firestoreDatabaseId}::${process.env.APP_URL || 'local'}`
  )
  .digest();

interface StoredSealRecord {
  id: string;
  name: string;
  question: string;
  hint: string;
  instructions: string;
  sealedEnvelope: string;
  createdAtIso: string;
}

interface EnvelopePayload {
  v: 1;
  saltHex: string;
  ivHex: string;
  authTagHex: string;
  ciphertextHex: string;
  argon2Hash: string;
}

// Local persistent fallback cache alongside Cloud Firestore
const DATA_DIR = path.resolve(__dirname, '.data');
const LOCAL_DB_PATH = path.resolve(DATA_DIR, 'seals.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readLocalCache(): Record<string, StoredSealRecord> {
  try {
    ensureDataDir();
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
    return JSON.parse(raw) as Record<string, StoredSealRecord>;
  } catch (err) {
    console.error('[Server] Failed to read local seal cache:', err);
    return {};
  }
}

function writeLocalCache(records: Record<string, StoredSealRecord>): void {
  try {
    ensureDataDir();
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Server] Failed to write local seal cache:', err);
  }
}

const memoryStore = new Map<string, StoredSealRecord>(
  Object.entries(readLocalCache())
);

function generateSecureSealId(): string {
  const alphabet =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.randomBytes(16);
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

/**
 * Creates a server-wrapped AES-256-GCM + Argon2id encrypted envelope.
 * - Uses Argon2id to hash the exact password bytes (no trimming, no normalization).
 * - Encrypts the secretContent + Argon2id hash with AES-256-GCM using the server master secret
 *   combined with the Argon2id key material.
 */
async function createSealedEnvelope(
  exactAnswer: string,
  secretContent: string
): Promise<string> {
  const salt = crypto.randomBytes(16);
  // 1. Compute standard encoded Argon2id hash for strict verification
  const argon2Hash = await argon2id({
    password: exactAnswer,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 16384, // 16 MB
    hashLength: 32,
    outputType: 'encoded',
  });

  // 2. Derive a content-encryption key combining SERVER_MASTER_SECRET and Argon2id raw key
  const rawArgonKeyHex = await argon2id({
    password: exactAnswer,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 16384,
    hashLength: 32,
    outputType: 'hex',
  });

  const combinedKey = crypto
    .createHmac('sha256', SERVER_MASTER_SECRET)
    .update(Buffer.from(rawArgonKeyHex, 'hex'))
    .digest();

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', combinedKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(secretContent, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Wrap envelope metadata with outer server AES-256-GCM layer so even the Argon2id parameters/hash are opaque outside the server
  const innerPayload: EnvelopePayload = {
    v: 1,
    saltHex: salt.toString('hex'),
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    ciphertextHex: encrypted.toString('hex'),
    argon2Hash,
  };

  const outerIv = crypto.randomBytes(12);
  const outerCipher = crypto.createCipheriv(
    'aes-256-gcm',
    SERVER_MASTER_SECRET,
    outerIv
  );
  const outerEncrypted = Buffer.concat([
    outerCipher.update(JSON.stringify(innerPayload), 'utf8'),
    outerCipher.final(),
  ]);
  const outerTag = outerCipher.getAuthTag();

  return [
    'v1',
    outerIv.toString('base64url'),
    outerTag.toString('base64url'),
    outerEncrypted.toString('base64url'),
  ].join('.');
}

/**
 * Verifies the candidate password against the sealed envelope on the backend.
 * Zero trimming, zero case-folding, zero normalization.
 */
async function verifyAndUnsealEnvelope(
  sealedEnvelope: string,
  candidateAnswer: string
): Promise<{ matched: boolean; secretContent?: string }> {
  try {
    const parts = sealedEnvelope.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      return { matched: false };
    }
    const outerIv = Buffer.from(parts[1], 'base64url');
    const outerTag = Buffer.from(parts[2], 'base64url');
    const outerEncrypted = Buffer.from(parts[3], 'base64url');

    const outerDecipher = crypto.createDecipheriv(
      'aes-256-gcm',
      SERVER_MASTER_SECRET,
      outerIv
    );
    outerDecipher.setAuthTag(outerTag);
    const innerJson = Buffer.concat([
      outerDecipher.update(outerEncrypted),
      outerDecipher.final(),
    ]).toString('utf8');

    const inner = JSON.parse(innerJson) as EnvelopePayload;

    // Verify exact candidateAnswer with Argon2id
    const isMatch = await argon2Verify({
      password: candidateAnswer,
      hash: inner.argon2Hash,
    });

    if (!isMatch) {
      return { matched: false };
    }

    // Re-derive key to decrypt the locked secretContent
    const salt = Buffer.from(inner.saltHex, 'hex');
    const rawArgonKeyHex = await argon2id({
      password: candidateAnswer,
      salt,
      parallelism: 1,
      iterations: 3,
      memorySize: 16384,
      hashLength: 32,
      outputType: 'hex',
    });

    const combinedKey = crypto
      .createHmac('sha256', SERVER_MASTER_SECRET)
      .update(Buffer.from(rawArgonKeyHex, 'hex'))
      .digest();

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      combinedKey,
      Buffer.from(inner.ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(inner.authTagHex, 'hex'));
    const decryptedSecret = Buffer.concat([
      decipher.update(Buffer.from(inner.ciphertextHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');

    return {
      matched: true,
      secretContent: decryptedSecret,
    };
  } catch (err) {
    console.error('[Server] Envelope verification failed:', err);
    return { matched: false };
  }
}

/**
 * Checks if the unlocked secretContent is a single valid http:// or https:// URL.
 */
function detectValidRedirectUrl(secretContent: string): string | null {
  const trimmed = secretContent.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return null;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      Boolean(parsed.hostname) &&
      parsed.hostname.includes('.')
    ) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

async function getSealRecordById(
  sealId: string
): Promise<StoredSealRecord | null> {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(sealId)) {
    return null;
  }
  const cached = memoryStore.get(sealId);
  if (cached) {
    return cached;
  }

  try {
    const snap = await getDoc(doc(firestoreDb, 'seals', sealId));
    if (snap.exists()) {
      const data = snap.data() as StoredSealRecord;
      memoryStore.set(sealId, data);
      writeLocalCache(Object.fromEntries(memoryStore.entries()));
      return data;
    }
  } catch (err) {
    console.error('[Server] Firestore getDoc error:', err);
  }
  return null;
}

async function saveSealRecord(record: StoredSealRecord): Promise<void> {
  memoryStore.set(record.id, record);
  writeLocalCache(Object.fromEntries(memoryStore.entries()));
  try {
    await setDoc(doc(firestoreDb, 'seals', record.id), record);
  } catch (err) {
    console.error('[Server] Firestore setDoc error:', err);
  }
}

// Rate limiter store: key = `${ip}::${sealId}`
interface RateBucket {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateBucket>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_ATTEMPTS = 25; // 25 attempts per minute per IP per seal

function checkRateLimit(ip: string, sealId: string): boolean {
  const now = Date.now();
  const key = `${ip}::${sealId}`;
  const bucket = rateLimitMap.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX_ATTEMPTS) {
    return false;
  }
  return true;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set('trust proxy', true);
  app.use(express.json({ limit: '256kb' }));

  // 1. Create a new Thiên Ấn
  app.post('/api/seals', async (req, res) => {
    try {
      const body = req.body ?? {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const question =
        typeof body.question === 'string' ? body.question.trim() : '';
      const hint = typeof body.hint === 'string' ? body.hint.trim() : '';
      const instructions =
        typeof body.instructions === 'string' ? body.instructions.trim() : '';
      // CRITICAL: Do NOT trim or alter `answer` or `secretContent`!
      const answer = typeof body.answer === 'string' ? body.answer : '';
      const secretContent =
        typeof body.secretContent === 'string' ? body.secretContent : '';

      if (!name || name.length > 200) {
        res.status(400).json({
          error: 'Vui lòng nhập Tên Thiên Ấn (tối đa 200 ký tự).',
        });
        return;
      }
      if (!question || question.length > 5000) {
        res.status(400).json({
          error: 'Vui lòng nhập Câu hỏi (tối đa 5.000 ký tự).',
        });
        return;
      }
      if (hint.length > 3000) {
        res.status(400).json({
          error: 'Gợi ý đáp án không vượt quá 3.000 ký tự.',
        });
        return;
      }
      if (instructions.length > 3000) {
        res.status(400).json({
          error: 'Hướng dẫn đáp án không vượt quá 3.000 ký tự.',
        });
        return;
      }
      if (answer.length === 0 || answer.length > 1000) {
        res.status(400).json({
          error: 'Vui lòng thiết lập Đáp án cho Thiên Ấn.',
        });
        return;
      }
      if (secretContent.length === 0 || secretContent.length > 20000) {
        res.status(400).json({
          error: 'Vui lòng nhập Nội dung bị khóa (tối đa 20.000 ký tự).',
        });
        return;
      }

      let id = generateSecureSealId();
      while (memoryStore.has(id)) {
        id = generateSecureSealId();
      }

      const sealedEnvelope = await createSealedEnvelope(answer, secretContent);
      const createdAtIso = new Date().toISOString();

      const record: StoredSealRecord = {
        id,
        name,
        question,
        hint,
        instructions,
        sealedEnvelope,
        createdAtIso,
      };

      await saveSealRecord(record);

      res.status(201).json({
        id: record.id,
        name: record.name,
        question: record.question,
        hint: record.hint,
        instructions: record.instructions,
        sealedEnvelope: record.sealedEnvelope,
        createdAtIso: record.createdAtIso,
      });
    } catch (err) {
      console.error('[Server] Error creating seal:', err);
      res.status(500).json({
        error: 'Không thể khởi tạo Thiên Ấn lúc này. Vui lòng thử lại.',
      });
    }
  });

  // 2. Get public Thiên Ấn info (NEVER returns answer or locked content)
  app.get('/api/seals/:id', async (req, res) => {
    try {
      const sealId = String(req.params.id || '');
      const record = await getSealRecordById(sealId);
      if (!record) {
        res.status(404).json({
          error: 'Không tìm thấy Thiên Ấn này hoặc đường dẫn không hợp lệ.',
        });
        return;
      }

      // Return ONLY public metadata
      res.json({
        id: record.id,
        name: record.name,
        question: record.question,
        hint: record.hint,
        instructions: record.instructions,
        createdAtIso: record.createdAtIso,
      });
    } catch (err) {
      console.error('[Server] Error fetching public seal:', err);
      res.status(500).json({
        error: 'Không thể tải thông tin Thiên Ấn.',
      });
    }
  });

  // 3. Sync an encrypted Firestore record into backend memory if fetched directly by client
  app.post('/api/seals/:id/sync', async (req, res) => {
    try {
      const sealId = String(req.params.id || '');
      if (!/^[a-zA-Z0-9_-]{8,64}$/.test(sealId)) {
        res.status(400).json({ ok: false });
        return;
      }
      if (!memoryStore.has(sealId) && req.body && typeof req.body.sealedEnvelope === 'string') {
        const record: StoredSealRecord = {
          id: sealId,
          name: String(req.body.name || '').slice(0, 200),
          question: String(req.body.question || '').slice(0, 5000),
          hint: String(req.body.hint || '').slice(0, 3000),
          instructions: String(req.body.instructions || '').slice(0, 3000),
          sealedEnvelope: String(req.body.sealedEnvelope).slice(0, 50000),
          createdAtIso: String(req.body.createdAtIso || new Date().toISOString()).slice(0, 40),
        };
        memoryStore.set(sealId, record);
        writeLocalCache(Object.fromEntries(memoryStore.entries()));
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[Server] Error syncing seal:', err);
      res.json({ ok: false });
    }
  });

  // 4. Strict Backend Password Verification
  // ONLY TWO BUSINESS OUTCOMES: MATCHED or "oops, sai mất rồi, vui lòng thử lại nhó🙈"
  app.post('/api/seals/:id/verify', async (req, res) => {
    const WRONG_MESSAGE = 'oops, sai mất rồi, vui lòng thử lại nhó🙈';
    try {
      const sealId = String(req.params.id || '');
      const clientIp = String(req.ip || req.socket.remoteAddress || 'unknown');

      if (!checkRateLimit(clientIp, sealId)) {
        // Rate limited: still return the exact same business error so no technical or password info is leaked
        await new Promise((r) => setTimeout(r, 250));
        res.status(200).json({
          matched: false,
          message: WRONG_MESSAGE,
        });
        return;
      }

      const record = await getSealRecordById(sealId);
      if (!record) {
        res.status(200).json({
          matched: false,
          message: WRONG_MESSAGE,
        });
        return;
      }

      // CRITICAL: Do NOT trim, lowercase, normalize, or alter candidateAnswer in any way.
      // Even an empty string "" must be treated as a wrong password attempt.
      const candidateAnswer =
        typeof req.body?.answer === 'string' ? req.body.answer : '';

      if (candidateAnswer.length === 0) {
        await new Promise((r) => setTimeout(r, 120));
        res.status(200).json({
          matched: false,
          message: WRONG_MESSAGE,
        });
        return;
      }

      const result = await verifyAndUnsealEnvelope(
        record.sealedEnvelope,
        candidateAnswer
      );

      if (!result.matched || result.secretContent === undefined) {
        res.status(200).json({
          matched: false,
          message: WRONG_MESSAGE,
        });
        return;
      }

      const redirectUrl = detectValidRedirectUrl(result.secretContent);

      res.status(200).json({
        matched: true,
        isRedirectUrl: Boolean(redirectUrl),
        redirectUrl: redirectUrl ?? null,
        secretContent: result.secretContent,
      });
    } catch (err) {
      console.error('[Server] Error during password verification:', err);
      res.status(200).json({
        matched: false,
        message: WRONG_MESSAGE,
      });
    }
  });

  // Helper to inject dynamic OpenGraph tags for /giai/:id social sharing (Facebook, Messenger, Zalo)
  async function injectShareMetaTags(
    html: string,
    urlPath: string
  ): Promise<string> {
    const match = urlPath.match(/^\/giai\/([a-zA-Z0-9_-]{8,64})/);
    if (!match) {
      return html;
    }
    const sealId = match[1];
    const record = await getSealRecordById(sealId);
    if (!record) {
      return html;
    }
    const safeTitle = escapeHtml(`THIÊN ẤN — ${record.name}`);
    const safeDesc = escapeHtml(
      'Mỗi bí mật đều có một chiếc chìa khóa. Hãy trả lời câu hỏi để mở khóa Thiên Ấn này.'
    );

    return html
      .replace(/<title>.*?<\/title>/i, `<title>${safeTitle}</title>`)
      .replace(
        /<meta property="og:title" content=".*?" \/>/i,
        `<meta property="og:title" content="${safeTitle}" />`
      )
      .replace(
        /<meta property="og:description" content=".*?" \/>/i,
        `<meta property="og:description" content="${safeDesc}" />`
      )
      .replace(
        /<meta name="description" content=".*?" \/>/i,
        `<meta name="description" content="${safeDesc}" />`
      );
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(
          path.resolve(__dirname, 'index.html'),
          'utf-8'
        );
        template = await vite.transformIndexHtml(url, template);
        template = await injectShareMetaTags(template, req.path);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath, { index: false }));

    app.get('*', async (req, res) => {
      try {
        const indexPath = path.join(distPath, 'index.html');
        let html = fs.readFileSync(indexPath, 'utf-8');
        html = await injectShareMetaTags(html, req.path);
        res.status(200).set({ 'Content-Type': 'text/html' }).send(html);
      } catch (err) {
        console.error('[Server] Failed to serve index.html:', err);
        res.status(500).send('Internal Server Error');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[THIÊN ẤN] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
