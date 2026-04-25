import React from 'react';

// ─── Chibi Cat (white / black) ───────────────────────────────────────────────
const ChibiCat = ({ color = 'white' }) => {
  const bk = color === 'black';
  const s = {
    body: bk ? '#374151' : '#f1f5f9',
    bodyD: bk ? '#1f2937' : '#e2e8f0',
    earIn: bk ? '#6b7280' : '#fecdd3',
    eye: bk ? '#fbbf24' : '#1e293b',
    nose: bk ? '#9ca3af' : '#fda4af',
    mouth: bk ? '#6b7280' : '#cbd5e1',
    blush: bk ? '#f87171' : '#fecdd3',
    tail: bk ? '#4b5563' : '#d1d5db',
    ol: bk ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)',
  };

  return (
    <div className="c-unit">
      <div className="c-bob">
        <div className="c-body" style={{ background:`linear-gradient(145deg,${s.body},${s.bodyD})`, boxShadow:`0 2px 6px rgba(0,0,0,0.08), 0 0 0 1px ${s.ol}` }} />
        <div className="c-head" style={{ background:`linear-gradient(155deg,${s.body},${s.bodyD})`, boxShadow:`0 1px 6px rgba(0,0,0,0.08), 0 0 0 1px ${s.ol}` }}>
          <div className="c-ear c-ear-l" style={{ borderBottomColor: s.bodyD }} />
          <div className="c-ear c-ear-r" style={{ borderBottomColor: s.bodyD }} />
          <div className="c-eari c-eari-l" style={{ borderBottomColor: s.earIn }} />
          <div className="c-eari c-eari-r" style={{ borderBottomColor: s.earIn }} />
          <div className="c-eye c-eye-l" style={{ background: s.eye }}>{bk && <div className="c-pupil" />}</div>
          <div className="c-eye c-eye-r" style={{ background: s.eye }}>{bk && <div className="c-pupil" />}</div>
          <div className="c-nose" style={{ background: s.nose }} />
          <div className="c-mouth c-mouth-l" style={{ borderBottomColor: s.mouth, borderLeftColor: s.mouth }} />
          <div className="c-mouth c-mouth-r" style={{ borderBottomColor: s.mouth, borderRightColor: s.mouth }} />
          <div className="c-blush c-blush-l" style={{ background: s.blush }} />
          <div className="c-blush c-blush-r" style={{ background: s.blush }} />
        </div>
        <div className="c-tail" style={{ borderTopColor: s.tail }} />
        <div className="c-leg c-fl" style={{ background:`linear-gradient(to bottom,${s.bodyD},${s.body})`, boxShadow:`0 0 0 0.5px ${s.ol}` }} />
        <div className="c-leg c-fr" style={{ background:`linear-gradient(to bottom,${s.bodyD},${s.body})`, boxShadow:`0 0 0 0.5px ${s.ol}` }} />
        <div className="c-leg c-bl" style={{ background:`linear-gradient(to bottom,${s.bodyD},${s.body})`, boxShadow:`0 0 0 0.5px ${s.ol}` }} />
        <div className="c-leg c-br" style={{ background:`linear-gradient(to bottom,${s.bodyD},${s.body})`, boxShadow:`0 0 0 0.5px ${s.ol}` }} />
      </div>
      <div className="c-shadow" />
    </div>
  );
};

// ─── Water Blob ──────────────────────────────────────────────────────────────
const WaterLoader = () => (
  <div className="wl">
    <div className="wr wr1" /><div className="wr wr2" /><div className="wr wr3" />
    <div className="wb">
      <div className="w-inner" /><div className="w-caustic" />
      <div className="w-hl w-hl1" /><div className="w-hl w-hl2" />
      <div className="w-bub w-b1" /><div className="w-bub w-b2" /><div className="w-bub w-b3" />
    </div>
    <div className="w-floor" />
  </div>
);

// ─── Main ────────────────────────────────────────────────────────────────────
export const LoadingModal = ({ isOpen, message = 'กำลังโหลด...' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
      <div className="lg-overlay" />

      <div className="lg-card">
        <WaterLoader />

        <div className="lg-pill">
          <p className="lg-msg">{message}</p>
        </div>

        {/* Two cats walking back and forth — NO clipping */}
        <div className="cats-area">
          <ChibiCat color="white" />
          <ChibiCat color="black" />
        </div>
      </div>

      <style>{`
/* ═══════════ GLASS OVERLAY ═══════════ */
.lg-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(135deg,
    rgba(255,255,255,.50),
    rgba(230,235,248,.60) 50%,
    rgba(255,255,255,.50));
  backdrop-filter: blur(60px) saturate(200%);
  -webkit-backdrop-filter: blur(60px) saturate(200%);
  animation: overlayIn .5s ease-out both;
}
@keyframes overlayIn { from { opacity: 0 } to { opacity: 1 } }

/* ═══════════ CARD ═══════════ */
.lg-card {
  position: relative; z-index: 10;
  display: flex; flex-direction: column; align-items: center; gap: 22px;
  padding: 40px 40px 28px;
  max-width: 340px; width: calc(100% - 40px);
  background: rgba(255,255,255,.38);
  backdrop-filter: blur(30px) saturate(160%);
  -webkit-backdrop-filter: blur(30px) saturate(160%);
  border: 1px solid rgba(255,255,255,.55);
  border-radius: 44px;
  box-shadow:
    0 30px 80px rgba(0,0,0,.06),
    0 0 0 1px rgba(255,255,255,.3) inset,
    0 1px 0 rgba(255,255,255,.8) inset;
  animation: cardIn .65s cubic-bezier(.16,1,.3,1) both;
}
@keyframes cardIn {
  from { opacity: 0; transform: translateY(28px) scale(.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ═══════════ MESSAGE ═══════════ */
.lg-pill {
  padding: 10px 26px;
  background: rgba(255,255,255,.5);
  backdrop-filter: blur(20px);
  border-radius: 50px;
  border: 1px solid rgba(255,255,255,.6);
  box-shadow: 0 4px 16px rgba(0,0,0,.04);
}
.lg-msg {
  font-weight: 700; font-size: 16px;
  letter-spacing: -.01em; color: #334155;
  white-space: nowrap;
}

/* ═══════════ WATER BLOB ═══════════ */
.wl { position: relative; width: 110px; height: 110px; display: flex; align-items: center; justify-content: center; }
.wr {
  position: absolute; border-radius: 50%;
  border: 1.5px solid rgba(147,197,253,.3);
  width: 56px; height: 56px;
  animation: ripple 3s ease-out infinite;
}
.wr1 { animation-delay: 0s } .wr2 { animation-delay: 1s } .wr3 { animation-delay: 2s }
@keyframes ripple {
  0% { transform: scale(1); opacity: .5 }
  100% { transform: scale(2.6); opacity: 0 }
}
.wb {
  position: relative; width: 66px; height: 66px;
  border-radius: 60% 40% 50% 50% / 50% 60% 40% 50%;
  background: linear-gradient(145deg,
    rgba(186,230,253,.70), rgba(147,197,253,.50) 25%,
    rgba(125,211,252,.60) 50%, rgba(165,180,252,.40) 75%,
    rgba(196,181,253,.50));
  box-shadow:
    0 8px 28px rgba(56,189,248,.20),
    0 0 0 1px rgba(255,255,255,.40) inset,
    0 -3px 10px rgba(147,197,253,.15) inset;
  animation: morph 4s ease-in-out infinite;
  overflow: hidden; z-index: 2;
}
@keyframes morph {
  0%   { border-radius: 60% 40% 50% 50%/50% 60% 40% 50%; transform: rotate(0) scale(1); }
  25%  { border-radius: 40% 60% 45% 55%/55% 40% 60% 45%; transform: rotate(5deg) scale(1.04); }
  50%  { border-radius: 50% 50% 40% 60%/45% 55% 45% 55%; transform: rotate(0) scale(.97); }
  75%  { border-radius: 55% 45% 60% 40%/50% 45% 55% 50%; transform: rotate(-5deg) scale(1.03); }
  100% { border-radius: 60% 40% 50% 50%/50% 60% 40% 50%; transform: rotate(0) scale(1); }
}
.w-inner {
  position: absolute; inset: 5px; border-radius: inherit;
  background: linear-gradient(160deg, rgba(224,242,254,.6), rgba(186,230,253,.3) 40%, transparent 70%);
  animation: wIn 4s ease-in-out infinite reverse;
}
@keyframes wIn { 0%,100%{transform:translate(0,0)} 33%{transform:translate(2px,-2px)} 66%{transform:translate(-2px,2px)} }
.w-caustic {
  position: absolute; inset: 0; border-radius: inherit;
  background: radial-gradient(ellipse at 30% 30%, rgba(255,255,255,.35), transparent 50%),
              radial-gradient(ellipse at 70% 60%, rgba(255,255,255,.15), transparent 40%);
  animation: wCa 6s ease-in-out infinite;
}
@keyframes wCa { 0%,100%{opacity:.8;transform:rotate(0)} 50%{opacity:1;transform:rotate(15deg)} }
.w-hl { position: absolute; background: rgba(255,255,255,.7); border-radius: 50%; }
.w-hl1 { width:14px;height:9px;top:11px;left:12px;transform:rotate(-25deg);animation:hlP 3s ease-in-out infinite }
.w-hl2 { width:7px;height:4px;top:18px;left:32px;opacity:.5;animation:hlP 3s ease-in-out infinite 1.5s }
@keyframes hlP { 0%,100%{opacity:.5;transform:scale(1) rotate(-25deg)} 50%{opacity:.85;transform:scale(1.12) rotate(-25deg)} }
.w-bub {
  position: absolute; border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.8), rgba(186,230,253,.3));
  border: .5px solid rgba(255,255,255,.5);
}
.w-b1{width:5px;height:5px;bottom:16px;left:18px;animation:bUp 2.5s ease-in-out infinite}
.w-b2{width:3.5px;height:3.5px;bottom:20px;right:16px;animation:bUp 3s ease-in-out infinite .8s}
.w-b3{width:4px;height:4px;bottom:14px;left:32px;animation:bUp 3.5s ease-in-out infinite 1.5s}
@keyframes bUp{0%{transform:translateY(0) scale(1);opacity:.7}50%{transform:translateY(-16px) scale(.7);opacity:.3}100%{transform:translateY(-28px) scale(.3);opacity:0}}
.w-floor{position:absolute;bottom:-2px;width:46px;height:7px;border-radius:50%;
  background:radial-gradient(ellipse,rgba(56,189,248,.10),transparent 70%);animation:wSh 4s ease-in-out infinite}
@keyframes wSh{0%,100%{transform:scaleX(1);opacity:.7}50%{transform:scaleX(1.3);opacity:.35}}

/* ═══════════ CATS AREA (no clipping!) ═══════════ */
.cats-area {
  display: flex; gap: 4px;
  /* Walk back and forth with translateX — cats stay fully visible */
  animation: catsWalk 5s ease-in-out infinite;
}

/* 
  0%   → start at left, facing right (scaleX 1)
  45%  → arrived at right
  45.1% → instant flip to face left (scaleX -1)
  90%  → arrived back at left
  90.1% → instant flip to face right again
*/
@keyframes catsWalk {
  0%    { transform: translateX(-40px) scaleX(1); }
  45%   { transform: translateX(40px)  scaleX(1); }
  45.1% { transform: translateX(40px)  scaleX(-1); }
  90%   { transform: translateX(-40px) scaleX(-1); }
  90.1% { transform: translateX(-40px) scaleX(1); }
  100%  { transform: translateX(-40px) scaleX(1); }
}

/* ═══════════ INDIVIDUAL CAT ═══════════ */
.c-unit { position: relative; width: 56px; height: 44px; }
.c-bob {
  position: relative; width: 56px; height: 44px;
  animation: bob .35s ease-in-out infinite;
}
@keyframes bob {
  0%, 100% { transform: translateY(0) rotate(-1.5deg); }
  50% { transform: translateY(-4px) rotate(1.5deg); }
}

/* Body */
.c-body {
  position: absolute; bottom: 7px; left: 5px;
  width: 32px; height: 19px;
  border-radius: 50% 50% 42% 42%;
}

/* Head */
.c-head {
  position: absolute; bottom: 13px; left: 26px;
  width: 26px; height: 22px;
  border-radius: 48% 48% 36% 36%;
  z-index: 2;
}

/* Ears */
.c-ear {
  position: absolute; width: 0; height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 9px solid;
}
.c-ear-l { top: -6px; left: 2px; transform: rotate(-8deg); }
.c-ear-r { top: -6px; right: 2px; transform: rotate(8deg); }
.c-eari {
  position: absolute; width: 0; height: 0;
  border-left: 2.5px solid transparent;
  border-right: 2.5px solid transparent;
  border-bottom: 5px solid;
  z-index: 3;
}
.c-eari-l { top: -4px; left: 4px; transform: rotate(-8deg); }
.c-eari-r { top: -4px; right: 4px; transform: rotate(8deg); }

/* Eyes */
.c-eye {
  position: absolute; width: 4px; height: 4.5px;
  border-radius: 50%; top: 7px;
  animation: blink 3.5s ease-in-out infinite;
}
.c-eye-l { left: 5px } .c-eye-r { right: 5px }
.c-pupil {
  position: absolute; top: 1px; left: 1px;
  width: 1.5px; height: 2px;
  background: #111827; border-radius: 50%;
}
@keyframes blink {
  0%,42%,58%,100% { transform: scaleY(1); }
  50% { transform: scaleY(.08); }
}

/* Nose */
.c-nose {
  position: absolute; width: 3px; height: 2px;
  border-radius: 50%; top: 11px;
  left: 50%; transform: translateX(-50%);
}

/* Mouth */
.c-mouth {
  position: absolute; width: 4px; height: 2.5px;
  border-bottom: 1.5px solid;
  border-radius: 0 0 50% 50%;
  top: 13px;
}
.c-mouth-l { left: 6px; border-left: 1.5px solid; }
.c-mouth-r { right: 6px; border-right: 1.5px solid; }

/* Blush */
.c-blush {
  position: absolute; width: 5px; height: 3px;
  border-radius: 50%; top: 11px; opacity: .5;
}
.c-blush-l { left: 0 } .c-blush-r { right: 0 }

/* Tail */
.c-tail {
  position: absolute; bottom: 10px; left: -1px;
  width: 13px; height: 13px;
  border: 2.5px solid transparent;
  border-top: 2.5px solid;
  border-radius: 50%;
  transform: rotate(-35deg);
  animation: tail .5s ease-in-out infinite alternate;
}
@keyframes tail { 0% { transform: rotate(-45deg) } 100% { transform: rotate(-10deg) } }

/* ═══════════ LEGS (diagonal pairing like real cat gait) ═══════════ */
.c-leg {
  position: absolute; bottom: 0;
  width: 6px; height: 9px;
  border-radius: 2px 2px 3px 3px;
  transform-origin: top center;
}
/* Front-left + Back-right move together */
.c-fl { left: 28px; animation: legA .35s ease-in-out infinite; }
.c-br { left: 16px; animation: legA .35s ease-in-out infinite; }
/* Front-right + Back-left move opposite */
.c-fr { left: 35px; animation: legB .35s ease-in-out infinite; }
.c-bl { left: 9px;  animation: legB .35s ease-in-out infinite; }

@keyframes legA {
  0%   { transform: rotate(20deg); }
  50%  { transform: rotate(-20deg); }
  100% { transform: rotate(20deg); }
}
@keyframes legB {
  0%   { transform: rotate(-20deg); }
  50%  { transform: rotate(20deg); }
  100% { transform: rotate(-20deg); }
}

/* Shadow */
.c-shadow {
  position: absolute; bottom: -3px;
  left: 50%; transform: translateX(-50%);
  width: 36px; height: 4px; border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0,0,0,.08), transparent 70%);
  animation: shd .35s ease-in-out infinite;
}
@keyframes shd {
  0%,100% { transform: translateX(-50%) scaleX(1); opacity: .7; }
  50% { transform: translateX(-50%) scaleX(.78); opacity: .35; }
}
      `}</style>
    </div>
  );
};
