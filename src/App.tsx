/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, useEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Lightbulb,
  Loader2,
  Lock,
  LockOpen,
  Share2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  fetchEncryptedSealFromFirestore,
  persistEncryptedSealToFirestore,
  SealFirestoreRecord,
} from './firebase';

const WRONG_PASSWORD_TEXT = 'oops, sai mất rồi, vui lòng thử lại nhó🙈';

interface PublicSealData {
  id: string;
  name: string;
  question: string;
  hint: string;
  instructions: string;
  createdAtIso: string;
}

// ============================================================================
// ERROR BOUNDARY
// ============================================================================
interface ErrorBoundaryProps {
  children: React.ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }
  override componentDidCatch(error: unknown) {
    console.error('[THIÊN ẤN] UI Error:', error);
  }
  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F4F8FF] text-[#173B70] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-[#DDEEFF] rounded-[22px] p-6 sm:p-8 text-center shadow-[0_10px_30px_rgba(23,59,112,0.05)]">
            <div className="w-10 h-10 rounded-full bg-[#DDEEFF]/70 text-[#326BC8] flex items-center justify-center mx-auto mb-3.5">
              <KeyRound className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-semibold text-[#173B70] mb-1.5">
              Đã xảy ra gián đoạn nhỏ
            </h1>
            <p className="text-sm text-[#60799B]">
              Vui lòng tải lại trang để tiếp tục.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// REUSABLE UI PRIMITIVES
// ============================================================================
function EtherealMinimalBackground() {
  const subtleStars = [
    { top: '15%', left: '18%', delay: '0s' },
    { top: '24%', left: '82%', delay: '1.8s' },
    { top: '54%', left: '12%', delay: '3.2s' },
    { top: '68%', left: '86%', delay: '0.9s' },
    { top: '82%', left: '26%', delay: '2.4s' },
  ];

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-gradient-to-b from-[#F9FBFF] via-[#F4F8FF] to-[#EBF3FF]"
    >
      {/* Soft ambient light blurs for depth */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[520px] h-[260px] rounded-full bg-[#DDEEFF]/65 blur-3xl" />
      <div className="absolute bottom-[-80px] right-[14%] w-[380px] h-[220px] rounded-full bg-[#75A9F4]/12 blur-3xl" />

      {/* Low-density slow drifting light particles */}
      {subtleStars.map((pos, idx) => (
        <span
          key={idx}
          style={{
            top: pos.top,
            left: pos.left,
            animationDelay: pos.delay,
          }}
          className="absolute w-1 h-1 rounded-full bg-[#75A9F4]/45 animate-ambient-drift"
        />
      ))}
    </div>
  );
}

// Header: Only displays refined Seal/Key Logo + THIÊN ẤN (No "Tạo Thiên Ấn" button)
function Header() {
  return (
    <header className="relative z-20 h-[58px] md:h-[64px] bg-white/85 backdrop-blur-md border-b border-[#DDEEFF]">
      <div className="max-w-[760px] mx-auto h-full px-4 sm:px-6 flex items-center">
        <Link
          to="/tao"
          className="inline-flex items-center gap-2.5 text-[#173B70] hover:text-[#326BC8] transition-colors duration-150 shrink-0"
        >
          <span className="relative w-8 h-8 rounded-full bg-[#F4F8FF] border border-[#75A9F4]/55 flex items-center justify-center text-[#326BC8] shadow-[0_2px_8px_rgba(50,107,200,0.08)]">
            <span className="absolute inset-[3px] rounded-full border border-[#DDEEFF]" />
            <KeyRound className="w-3.5 h-3.5 relative z-10" />
          </span>
          <span className="font-brand text-[21px] sm:text-[23px] font-bold tracking-[0.04em] text-[#173B70]">
            THIÊN ẤN
          </span>
        </Link>
      </div>
    </header>
  );
}

function PageHero({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="text-center mb-5 sm:mb-6">
      <div className="w-10 h-10 rounded-full bg-white border border-[#D7E5F7] shadow-[0_4px_12px_rgba(25,55,97,0.05)] text-[#326BC8] flex items-center justify-center mx-auto mb-2.5">
        {icon}
      </div>
      <h1
        style={{ textWrap: 'balance' }}
        className="text-[26px] sm:text-[34px] font-bold tracking-tight text-[#193761] leading-tight mb-1.5"
      >
        {title}
      </h1>
      <p className="text-[14px] sm:text-[15px] text-[#60799B] max-w-md mx-auto leading-relaxed">
        {subtitle}
      </p>
    </div>
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[14px] font-semibold text-[#173B70] mb-1.5"
    >
      {children}
    </label>
  );
}

interface AutoTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minHeightPx?: number;
}

function AutoExpandingTextarea({
  value,
  onChange,
  minHeightPx = 96,
  className = '',
  ...rest
}: AutoTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minHeightPx)}px`;
  }, [value, minHeightPx]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      style={{ minHeight: `${minHeightPx}px` }}
      className={`w-full px-3.5 py-3 rounded-[12px] bg-[#F6FAFF] border border-[#D7E5F7] text-[#193761] placeholder-[#60799B]/70 text-base leading-relaxed resize-none overflow-hidden focus:outline-none focus:bg-white focus:border-[#326BC8] focus:ring-3 focus:ring-[#326BC8]/15 transition-all duration-150 ${className}`}
      {...rest}
    />
  );
}

// ============================================================================
// TRANG 1: TẠO PASS (/tao) — UNCHANGED FUNCTIONALITY & LAYOUT
// ============================================================================
function CreateSealPage() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [hint, setHint] = useState('');
  const [instructions, setInstructions] = useState('');
  const [answer, setAnswer] = useState('');
  const [secretContent, setSecretContent] = useState('');

  const [showAnswer, setShowAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Tạo Thiên Ấn — THIÊN ẤN';
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Vui lòng nhập Tên Thiên Ấn.');
      return;
    }
    if (!question.trim()) {
      setFormError('Vui lòng nhập Câu hỏi.');
      return;
    }
    if (answer.length === 0) {
      setFormError('Vui lòng nhập Đáp án.');
      return;
    }
    if (secretContent.length === 0) {
      setFormError('Vui lòng nhập Nội dung bị khóa.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/seals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          question: question.trim(),
          hint: hint.trim(),
          instructions: instructions.trim(),
          // CRITICAL: Preserve exact answer and secretContent without trimming or normalization
          answer,
          secretContent,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.id) {
        setFormError(
          data.error || 'Không thể tạo Thiên Ấn lúc này. Vui lòng thử lại.'
        );
        setSubmitting(false);
        return;
      }

      if (data.sealedEnvelope) {
        const firestoreRecord: SealFirestoreRecord = {
          id: data.id,
          name: data.name,
          question: data.question,
          hint: data.hint ?? '',
          instructions: data.instructions ?? '',
          sealedEnvelope: data.sealedEnvelope,
          createdAtIso: data.createdAtIso,
        };
        await persistEncryptedSealToFirestore(firestoreRecord).catch((err) => {
          console.error('[THIÊN ẤN] Firestore client sync warning:', err);
        });
      }

      navigate(`/giai/${data.id}`);
    } catch (err) {
      console.error('[THIÊN ẤN] Submit error:', err);
      setFormError('Không thể kết nối máy chủ. Vui lòng thử lại.');
      setSubmitting(false);
    }
  }

  return (
    <motion.main
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="relative z-10 w-full max-w-[760px] mx-auto px-4 sm:px-6 pt-5 sm:pt-7 pb-8"
    >
      <PageHero
        icon={<Lock className="w-[18px] h-[18px]" />}
        title="Tạo Thiên Ấn"
        subtitle="“Cất giữ một bí mật, chờ người hữu duyên giải mã.”"
      />

      <section className="bg-white border border-[#D7E5F7] rounded-[22px] p-5 sm:p-7 shadow-[0_10px_32px_rgba(25,55,97,0.05)]">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Field 1 — Tên */}
          <div>
            <FieldLabel htmlFor="seal-name">Tên Thiên Ấn</FieldLabel>
            <input
              id="seal-name"
              type="text"
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Đặt tên cho Thiên Ấn của bạn…"
              className="w-full h-[50px] px-3.5 rounded-[12px] bg-[#F6FAFF] border border-[#D7E5F7] text-[#193761] placeholder-[#60799B]/70 text-base focus:outline-none focus:bg-white focus:border-[#326BC8] focus:ring-3 focus:ring-[#326BC8]/15 transition-all duration-150"
            />
          </div>

          {/* Field 2 — Câu hỏi */}
          <div>
            <FieldLabel htmlFor="seal-question">Câu hỏi</FieldLabel>
            <AutoExpandingTextarea
              id="seal-question"
              minHeightPx={96}
              maxLength={5000}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Nhập câu hỏi của bạn…"
            />
          </div>

          {/* Field 3 & 4 — Gợi ý đáp án & Hướng dẫn đáp án */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <FieldLabel htmlFor="seal-hint">Gợi ý đáp án</FieldLabel>
              <AutoExpandingTextarea
                id="seal-hint"
                minHeightPx={88}
                maxLength={3000}
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Một chút gợi ý dành cho người giải…"
              />
            </div>

            <div>
              <FieldLabel htmlFor="seal-instructions">
                Hướng dẫn đáp án
              </FieldLabel>
              <AutoExpandingTextarea
                id="seal-instructions"
                minHeightPx={88}
                maxLength={3000}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Hướng dẫn cách nhập đáp án…"
              />
            </div>
          </div>

          {/* Field 5 — Đáp án */}
          <div>
            <FieldLabel htmlFor="seal-answer">Đáp án</FieldLabel>
            <div className="relative">
              <input
                id="seal-answer"
                type={showAnswer ? 'text' : 'password'}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                placeholder="Nhập mật khẩu chính xác…"
                className="w-full h-[50px] pl-3.5 pr-12 rounded-[12px] bg-[#F6FAFF] border border-[#D7E5F7] text-[#193761] placeholder-[#60799B]/70 text-base focus:outline-none focus:bg-white focus:border-[#326BC8] focus:ring-3 focus:ring-[#326BC8]/15 transition-all duration-150"
              />
              <button
                type="button"
                onClick={() => setShowAnswer((prev) => !prev)}
                aria-label={showAnswer ? 'Ẩn đáp án' : 'Hiện đáp án'}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 rounded-[10px] text-[#60799B] hover:text-[#193761] hover:bg-[#DCEBFF]/40 flex items-center justify-center transition-colors duration-150 cursor-pointer"
              >
                {showAnswer ? (
                  <EyeOff className="w-[18px] h-[18px]" />
                ) : (
                  <Eye className="w-[18px] h-[18px]" />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-[13px] text-[#60799B]">
              Phân biệt chữ hoa, chữ thường, dấu và khoảng trắng.
            </p>
          </div>

          {/* Field 6 — Nội dung bị khóa */}
          <div>
            <FieldLabel htmlFor="seal-secret">Nội dung bị khóa</FieldLabel>
            <AutoExpandingTextarea
              id="seal-secret"
              minHeightPx={116}
              maxLength={20000}
              value={secretContent}
              onChange={(e) => setSecretContent(e.target.value)}
              placeholder="Nhập văn bản bí mật hoặc đường link cần bảo vệ…"
            />
            <p className="mt-1.5 text-[13px] text-[#60799B]">
              Nếu là đường link, hệ thống sẽ tự chuyển đến đó khi giải đúng.
            </p>
          </div>

          {formError && (
            <div
              role="alert"
              className="px-3.5 py-2.5 rounded-[12px] bg-[#F6FAFF] border border-[#326BC8]/35 text-[#193761] text-sm"
            >
              {formError}
            </div>
          )}

          {/* Primary CTA */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-[52px] px-6 rounded-[13px] bg-[#326BC8] hover:bg-[#2459AE] active:scale-[0.995] text-white font-semibold text-base shadow-[0_4px_14px_rgba(50,107,200,0.22)] transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-65 cursor-pointer whitespace-nowrap"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-[18px] h-[18px] animate-spin" />
                  <span>Đang tạo Thiên Ấn…</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-[18px] h-[18px]" />
                  <span>Tạo Thiên Ấn</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </motion.main>
  );
}

// ============================================================================
// INTERACTIVE SEAL EMBLEM (3 STATES: LOCKED/FOCUSED, WRONG, UNLOCKING/OPEN)
// ============================================================================
type SealPhase = 'locked' | 'wrong' | 'activating' | 'breaking' | 'unlocked';

function InteractiveSealHero({
  phase,
  inputFocused,
}: {
  phase: SealPhase;
  inputFocused: boolean;
}) {
  const isOpen =
    phase === 'activating' || phase === 'breaking' || phase === 'unlocked';

  // 6 delicate burst particles during Phase 2 ('breaking')
  const burstParticles = [
    { x: 0, y: -34 },
    { x: 30, y: -17 },
    { x: 30, y: 17 },
    { x: 0, y: 34 },
    { x: -30, y: 17 },
    { x: -30, y: -17 },
  ];

  return (
    <div className="text-center mb-4 sm:mb-5">
      {/* Interactive Double-Circle Seal */}
      <div className="relative w-16 h-16 mx-auto mb-2.5 flex items-center justify-center">
        {/* Soft blue halo behind the seal */}
        <div
          className={`absolute inset-0 rounded-full transition-all duration-200 ${
            phase === 'unlocked'
              ? 'bg-[#75A9F4]/25 scale-110 opacity-80 blur-md'
              : phase === 'activating' || phase === 'breaking'
                ? 'bg-[#326BC8]/35 scale-125 opacity-95 blur-md'
                : inputFocused
                  ? 'bg-[#75A9F4]/35 scale-110 opacity-85 blur-md'
                  : 'bg-[#75A9F4]/22 blur-md animate-seal-breathing'
          }`}
        />

        {/* Phase 2: Expanding light wave when seal breaks */}
        {phase === 'breaking' && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border border-[#75A9F4] bg-[#DDEEFF]/40 animate-seal-break-wave pointer-events-none"
          />
        )}

        {/* Phase 2: Subtle light particles */}
        <AnimatePresence>
          {phase === 'breaking' &&
            burstParticles.map((pt, idx) => (
              <motion.span
                key={idx}
                initial={{ opacity: 0.95, x: 0, y: 0, scale: 0.9 }}
                animate={{ opacity: 0, x: pt.x, y: pt.y, scale: 0.3 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="absolute w-1.5 h-1.5 rounded-full bg-[#326BC8] shadow-[0_0_6px_#75A9F4] pointer-events-none"
              />
            ))}
        </AnimatePresence>

        {/* Main Double-Ring Seal Container */}
        <div
          className={`relative w-14 h-14 rounded-full bg-white flex items-center justify-center transition-all duration-200 ${
            phase === 'wrong' ? 'animate-seal-wrong-shake' : ''
          } ${
            isOpen
              ? 'border-2 border-[#326BC8] shadow-[0_0_24px_rgba(50,107,200,0.28)] scale-[1.03]'
              : inputFocused
                ? 'border-[1.5px] border-[#326BC8] shadow-[0_0_18px_rgba(50,107,200,0.2)] scale-[1.02]'
                : 'border-[1.5px] border-[#326BC8]/80 shadow-[0_4px_14px_rgba(23,59,112,0.08)]'
          }`}
        >
          {/* Outer subtle pulse ring on wrong attempt */}
          {phase === 'wrong' && (
            <span
              aria-hidden="true"
              className="absolute inset-[-3px] rounded-full border border-[#326BC8] animate-seal-ring-flash pointer-events-none"
            />
          )}

          {/* Inner concentric seal ring */}
          <span
            aria-hidden="true"
            className={`
              absolute inset-[4px] rounded-full transition-all duration-300
              ${
                phase === 'breaking'
                  ? 'border border-dashed border-[#75A9F4] scale-110 opacity-75'
                  : isOpen
                    ? 'border border-[#75A9F4]/70 bg-[#F4F8FF]/60'
                    : inputFocused
                      ? 'border border-[#75A9F4]/85 bg-[#F4F8FF]/50'
                      : 'border border-[#DDEEFF] bg-[#F4F8FF]/35'
              }
            `}
          />

          {/* Center Lock / Open Lock Icon */}
          <div className="relative z-10 text-[#326BC8] transition-transform duration-200">
            {isOpen ? (
              <LockOpen className="w-5 h-5 text-[#326BC8]" />
            ) : (
              <Lock
                className={`w-5 h-5 transition-colors duration-200 ${
                  inputFocused ? 'text-[#326BC8]' : 'text-[#173B70]'
                }`}
              />
            )}
          </div>
        </div>
      </div>

      <h1
        style={{ textWrap: 'balance' }}
        className="text-[26px] sm:text-[32px] font-bold tracking-tight text-[#173B70] leading-tight mb-1"
      >
        Giải Thiên Ấn
      </h1>
      <p className="text-[14px] sm:text-[15px] text-[#60799B] max-w-md mx-auto">
        “Mỗi bí mật đều có một chiếc chìa khóa.”
      </p>
    </div>
  );
}

// ============================================================================
// TRANG 2: GIẢI PASS (/giai/:id)
// ============================================================================
function SolveSealPage() {
  const { id } = useParams<{ id: string }>();

  const [seal, setSeal] = useState<PublicSealData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [answerInput, setAnswerInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [sealPhase, setSealPhase] = useState<SealPhase>('locked');
  const [inputFeedbackPulse, setInputFeedbackPulse] = useState(false);

  const [wrongAttemptCount, setWrongAttemptCount] = useState(0);
  const [wrongMessage, setWrongMessage] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [unlockedContent, setUnlockedContent] = useState<string | null>(null);
  const [revealVisible, setRevealVisible] = useState(false);

  const [copiedShare, setCopiedShare] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);

  const timersRef = useRef<number[]>([]);

  function clearAllTimers() {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, []);

  const shareUrl =
    typeof window !== 'undefined' && id
      ? `${window.location.origin}/giai/${id}`
      : '';

  useEffect(() => {
    let cancelled = false;
    clearAllTimers();

    async function loadSeal() {
      if (!id) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setLoading(true);
      setNotFound(false);
      setUnlockedContent(null);
      setRevealVisible(false);
      setSealPhase('locked');
      setInputFeedbackPulse(false);
      setWrongMessage(null);
      setConnectionError(null);
      setAnswerInput('');

      try {
        let res = await fetch(`/api/seals/${encodeURIComponent(id)}`);
        if (res.status === 404) {
          const firestoreDoc = await fetchEncryptedSealFromFirestore(id).catch(
            () => null
          );
          if (firestoreDoc) {
            await fetch(`/api/seals/${encodeURIComponent(id)}/sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(firestoreDoc),
            });
            res = await fetch(`/api/seals/${encodeURIComponent(id)}`);
          }
        }

        if (!res.ok) {
          if (!cancelled) {
            setNotFound(true);
            setLoading(false);
          }
          return;
        }

        const data = (await res.json()) as PublicSealData;
        if (!cancelled) {
          setSeal(data);
          document.title = `${data.name} — Giải Thiên Ấn | THIÊN ẤN`;
          setLoading(false);
        }
      } catch (err) {
        console.error('[THIÊN ẤN] Failed to load seal:', err);
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      }
    }

    loadSeal();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function triggerWrongAnimation() {
    clearAllTimers();
    setSealPhase('wrong');
    setInputFeedbackPulse(true);
    setWrongMessage(WRONG_PASSWORD_TEXT);
    setWrongAttemptCount((c) => c + 1);

    const t = window.setTimeout(() => {
      setSealPhase((current) => (current === 'wrong' ? 'locked' : current));
      setInputFeedbackPulse(false);
    }, 320);
    timersRef.current.push(t);
  }

  function triggerUnlockSequence(secretText: string) {
    clearAllTimers();
    setWrongMessage(null);
    setUnlockedContent(secretText);

    // Phase 1: Seal Activation (0–250ms)
    setSealPhase('activating');

    // Phase 2: Seal Break (250–600ms)
    const t1 = window.setTimeout(() => {
      setSealPhase('breaking');
    }, 250);

    // Phase 3 & 4: Reveal Card & Settle into Completed Open state (600ms)
    const t2 = window.setTimeout(() => {
      setSealPhase('unlocked');
      setRevealVisible(true);
    }, 600);

    timersRef.current.push(t1, t2);
  }

  async function handleUnlockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !id ||
      verifying ||
      sealPhase === 'activating' ||
      sealPhase === 'breaking'
    ) {
      return;
    }

    setVerifying(true);
    setConnectionError(null);

    try {
      // CRITICAL: Send exact answerInput without trimming, lowercasing, or altering characters
      const res = await fetch(`/api/seals/${encodeURIComponent(id)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: answerInput,
        }),
      });

      if (!res.ok) {
        setConnectionError(
          'Không thể kết nối máy chủ lúc này, vui lòng thử lại.'
        );
        setVerifying(false);
        return;
      }

      const data = await res.json();

      if (!data.matched) {
        setUnlockedContent(null);
        setRevealVisible(false);
        setVerifying(false);
        triggerWrongAnimation();
        return;
      }

      // Password matched 100%
      setWrongMessage(null);

      // CASE: Locked content is a valid http:// or https:// URL -> Redirect IMMEDIATELY without waiting for animation
      if (data.isRedirectUrl && typeof data.redirectUrl === 'string') {
        window.location.href = data.redirectUrl;
        return;
      }

      // CASE: Locked content is text -> Run 4-phase Interactive Seal unlock sequence
      setVerifying(false);
      triggerUnlockSequence(String(data.secretContent ?? ''));
    } catch (err) {
      console.error('[THIÊN ẤN] Connection error during verification:', err);
      setConnectionError(
        'Kết nối tạm thời gián đoạn, vui lòng kiểm tra mạng và thử lại.'
      );
      setVerifying(false);
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    } catch {
      const temp = document.createElement('input');
      temp.value = shareUrl;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    }
  }

  async function handleShareClick() {
    if (!shareUrl) return;
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'
    ) {
      try {
        await navigator.share({
          title: seal ? `THIÊN ẤN — ${seal.name}` : 'THIÊN ẤN',
          text: seal
            ? `Giải mã Thiên Ấn: "${seal.name}"`
            : 'Mỗi bí mật đều có một chiếc chìa khóa.',
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to copying link if user cancels or environment blocks share sheet
      }
    }
    await copyShareLink();
  }

  async function copyUnlockedSecret() {
    if (unlockedContent === null) return;
    try {
      await navigator.clipboard.writeText(unlockedContent);
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 2000);
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <main className="relative z-10 w-full max-w-[700px] mx-auto px-4 sm:px-6 pt-5 sm:pt-7 pb-8">
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-full bg-white border border-[#DDEEFF] mx-auto mb-2.5 animate-pulse" />
          <div className="h-7 w-40 bg-[#DDEEFF]/70 rounded-lg mx-auto mb-2 animate-pulse" />
          <div className="h-4 w-60 bg-[#DDEEFF]/50 rounded-md mx-auto animate-pulse" />
        </div>
        <div className="bg-white border border-[#DDEEFF] rounded-[22px] p-5 sm:p-7 shadow-[0_10px_32px_rgba(23,59,112,0.05)] space-y-4 animate-pulse">
          <div className="h-6 w-2/5 bg-[#DDEEFF]/60 rounded-md" />
          <div className="h-24 w-full bg-[#F4F8FF] rounded-[14px]" />
          <div className="h-[54px] w-full bg-[#F4F8FF] rounded-[12px]" />
          <div className="h-[54px] w-full bg-[#DDEEFF]/60 rounded-[14px]" />
        </div>
      </main>
    );
  }

  if (notFound || !seal) {
    return (
      <main className="relative z-10 w-full max-w-[700px] mx-auto px-4 sm:px-6 pt-8 pb-10">
        <div className="bg-white border border-[#DDEEFF] rounded-[22px] p-6 sm:p-8 text-center shadow-[0_10px_32px_rgba(23,59,112,0.05)]">
          <div className="w-12 h-12 rounded-full bg-[#F4F8FF] border border-[#DDEEFF] text-[#326BC8] flex items-center justify-center mx-auto mb-3.5">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-[#173B70] mb-1.5">
            Không tìm thấy Thiên Ấn
          </h1>
          <p className="text-sm text-[#60799B] max-w-md mx-auto">
            Đường dẫn này không tồn tại hoặc đã bị nhập sai địa chỉ.
          </p>
        </div>
      </main>
    );
  }

  const hasHint = Boolean(seal.hint && seal.hint.trim().length > 0);
  const hasInstructions = Boolean(
    seal.instructions && seal.instructions.trim().length > 0
  );
  const isSealOpen =
    sealPhase === 'activating' ||
    sealPhase === 'breaking' ||
    sealPhase === 'unlocked';

  return (
    <motion.main
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="relative z-10 w-full max-w-[700px] mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-10"
    >
      {/* 1. Hero Section with Interactive Seal */}
      <InteractiveSealHero phase={sealPhase} inputFocused={inputFocused} />

      {/* 2. Main Card — Nội dung câu đố */}
      <section className="bg-white border border-[#DDEEFF] rounded-[22px] p-5 sm:p-7 shadow-[0_12px_36px_rgba(23,59,112,0.055)] space-y-5">
        {/* A. TÊN THIÊN ẤN */}
        <div>
          <h2
            style={{ textWrap: 'balance' }}
            className="text-[20px] sm:text-[23px] font-semibold text-[#173B70] leading-snug break-words"
          >
            {seal.name}
          </h2>
        </div>

        {/* B. CÂU HỎI */}
        <div className="rounded-[15px] bg-[#F4F8FF] border border-[#DDEEFF] px-4 py-4 sm:px-5 sm:py-4.5">
          <div className="text-[16px] sm:text-[17px] text-[#173B70] font-medium leading-[1.7] whitespace-pre-wrap break-words">
            {seal.question}
          </div>
        </div>

        {/* C. GỢI Ý ĐÁP ÁN & D. HƯỚNG DẪN ĐÁP ÁN */}
        {(hasHint || hasInstructions) && (
          <div className="space-y-2.5">
            {hasHint && (
              <div className="rounded-[12px] bg-[#DDEEFF]/55 border border-[#75A9F4]/35 px-3.5 py-3 flex items-start gap-2.5">
                <Lightbulb className="w-4 h-4 text-[#326BC8] shrink-0 mt-0.5" />
                <div className="text-sm text-[#173B70] leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-semibold text-[#173B70]">Gợi ý: </span>
                  <span>{seal.hint}</span>
                </div>
              </div>
            )}

            {hasInstructions && (
              <div className="rounded-[12px] bg-[#F4F8FF]/85 border border-[#DDEEFF] px-3.5 py-3 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-[#60799B] shrink-0 mt-0.5" />
                <div className="text-sm text-[#60799B] leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-medium text-[#173B70]">
                    Hướng dẫn nhập:{' '}
                  </span>
                  <span>{seal.instructions}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* E. NHẬP MẬT KHẨU & F. NÚT GIẢI ẤN */}
        <form onSubmit={handleUnlockSubmit} className="space-y-3.5" noValidate>
          <div>
            <FieldLabel htmlFor="solve-password-input">Đáp án</FieldLabel>
            <div className="relative">
              <input
                id="solve-password-input"
                type={showPassword ? 'text' : 'password'}
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                placeholder="Nhập mật khẩu để giải ấn…"
                className={`w-full h-[54px] pl-4 pr-12 rounded-[12px] bg-[#F4F8FF] text-[#173B70] placeholder-[#60799B]/65 text-base focus:outline-none focus:bg-white transition-all duration-150 ${
                  inputFeedbackPulse
                    ? 'border-[#326BC8] ring-3 ring-[#75A9F4]/35 bg-white'
                    : 'border border-[#DDEEFF] focus:border-[#326BC8] focus:ring-3 focus:ring-[#326BC8]/15'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-[10px] text-[#60799B] hover:text-[#173B70] hover:bg-[#DDEEFF]/50 flex items-center justify-center transition-colors duration-150 cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-[18px] h-[18px]" />
                ) : (
                  <Eye className="w-[18px] h-[18px]" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={verifying}
            className="w-full h-[54px] px-6 rounded-[14px] bg-[#326BC8] hover:bg-[#2459AE] active:scale-[0.995] text-white font-semibold text-base shadow-[0_4px_16px_rgba(50,107,200,0.22)] hover:shadow-[0_6px_22px_rgba(50,107,200,0.34)] transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-65 cursor-pointer whitespace-nowrap"
          >
            {verifying ? (
              <>
                <Loader2 className="w-[18px] h-[18px] animate-spin" />
                <span>Đang kiểm tra…</span>
              </>
            ) : (
              <>
                {isSealOpen ? (
                  <LockOpen className="w-[18px] h-[18px]" />
                ) : (
                  <KeyRound className="w-[18px] h-[18px]" />
                )}
                <span>GIẢI ẤN</span>
              </>
            )}
          </button>

          {/* STATE 2: NHẬP SAI MẬT KHẨU */}
          <AnimatePresence mode="wait">
            {wrongMessage && (
              <motion.div
                key={`wrong-${wrongAttemptCount}`}
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                role="alert"
                className="px-3.5 py-2.5 rounded-[12px] bg-[#F4F8FF] border border-[#75A9F4]/45 text-[#173B70] text-sm font-medium text-center"
              >
                {wrongMessage}
              </motion.div>
            )}
          </AnimatePresence>

          {connectionError && (
            <div
              role="alert"
              className="px-3.5 py-2.5 rounded-[12px] bg-[#F4F8FF] border border-[#DDEEFF] text-[#60799B] text-sm text-center"
            >
              {connectionError}
            </div>
          )}
        </form>

        {/* G. CHIA SẺ */}
        <div className="pt-1 flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleShareClick}
            className="flex-1 h-[48px] px-4 rounded-[12px] bg-[#F4F8FF] hover:bg-[#DDEEFF]/60 border border-[#DDEEFF] text-[#173B70] text-sm font-medium transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Share2 className="w-4 h-4 text-[#326BC8]" />
            <span>
              {copiedShare ? 'Đã sao chép liên kết' : 'Chia sẻ Thiên Ấn'}
            </span>
          </button>

          <button
            type="button"
            onClick={copyShareLink}
            aria-label="Sao chép đường dẫn"
            title="Sao chép đường dẫn"
            className="w-[48px] h-[48px] rounded-[12px] bg-[#F4F8FF] hover:bg-[#DDEEFF]/60 border border-[#DDEEFF] text-[#173B70] flex items-center justify-center transition-colors duration-150 cursor-pointer shrink-0"
          >
            {copiedShare ? (
              <Check className="w-4 h-4 text-[#326BC8]" />
            ) : (
              <Copy className="w-4 h-4 text-[#60799B]" />
            )}
          </button>
        </div>
      </section>

      {/* VI. CARD NỘI DUNG SAU MỞ KHÓA (Chỉ xuất hiện ở Phase 3 sau khi phong ấn mở) */}
      <AnimatePresence>
        {revealVisible && unlockedContent !== null && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 bg-white border border-[#75A9F4]/55 rounded-[22px] p-5 sm:p-7 shadow-[0_12px_36px_rgba(23,59,112,0.065)]"
          >
            <div className="flex items-center justify-between gap-3 mb-3.5 pb-3 border-b border-[#DDEEFF]">
              <div className="flex items-center gap-2 text-[16px] font-bold text-[#173B70]">
                <span className="w-7 h-7 rounded-full bg-[#F4F8FF] border border-[#DDEEFF] flex items-center justify-center text-[#326BC8]">
                  <LockOpen className="w-3.5 h-3.5" />
                </span>
                <h3>Thiên Ấn Đã Mở</h3>
              </div>

              <button
                type="button"
                onClick={copyUnlockedSecret}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-[10px] bg-[#F4F8FF] hover:bg-[#DDEEFF]/60 border border-[#DDEEFF] text-[#173B70] text-xs font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedContent ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#326BC8]" />
                    <span>Đã sao chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#326BC8]" />
                    <span>Sao chép</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-[15px] sm:text-[16px] text-[#173B70] leading-[1.7] whitespace-pre-wrap break-words select-all">
              {unlockedContent}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </motion.main>
  );
}

// ============================================================================
// ROOT APP
// ============================================================================
export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col relative selection:bg-[#DDEEFF] selection:text-[#173B70] pb-[env(safe-area-inset-bottom)]">
          <EtherealMinimalBackground />
          <Header />

          <div className="flex-1 flex flex-col">
            <Routes>
              <Route path="/" element={<Navigate to="/tao" replace />} />
              <Route path="/tao" element={<CreateSealPage />} />
              <Route path="/giai/:id" element={<SolveSealPage />} />
              <Route path="*" element={<Navigate to="/tao" replace />} />
            </Routes>
          </div>

          <footer className="relative z-10 py-5 px-4 text-center">
            <p className="text-xs text-[#60799B]">
              THIÊN ẤN · Cất giữ điều chưa nói.
            </p>
          </footer>
        </div>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
