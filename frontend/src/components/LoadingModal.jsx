import React, { useState } from 'react';
import {
  CAT_ACTIONS,
  getRandomCatActionIndex,
  getCatActionByIndex,
  getAdjacentCatActionIndex,
  getLoaderPresentation,
} from '../utils/catLoaderActions';

// ─── MASTERPIECE KAWAII CAT RIG ENGINE ───────────────────────────────────────
// Anatomically cohesive, adorable chibi proportions (no bowling pins, no floating heads)

/**
 * White Cat Character Rig
 * Props: x, y, scale, eyeState ('happy'|'joy'|'wink'|'wide'|'closed'), mouth ('3'|'open'|'tongue'), pose ('stand'|'sit'|'crouch'|'run'|'sleep')
 */
const CuteWhiteCat = ({
  x = 0,
  y = 0,
  scale = 1,
  rotation = 0,
  eyeState = 'happy',
  mouth = '3',
  hasBlush = true,
  armL = null,
  armR = null,
  className = '',
}) => (
  <g transform={`translate(${x}, ${y}) scale(${scale}) rotate(${rotation})`} className={className}>
    {/* Haunches / Back Body */}
    <path
      d="M -15 14 C -22 22 -20 38 0 38 C 20 38 22 22 15 14 C 11 16 -11 16 -15 14 Z"
      fill="#ffffff"
      stroke="#e2e8f0"
      strokeWidth="1.2"
    />
    {/* Soft Creamy Belly Gradient */}
    <ellipse cx="0" cy="24" rx="11" ry="10" fill="#f8fafc" />

    {/* Tail */}
    <path
      d="M -14 30 C -24 32 -26 20 -20 16"
      stroke="#ffffff"
      strokeWidth="4.5"
      strokeLinecap="round"
      fill="none"
      className="cat-tail-wag"
    />

    {/* Paws (default resting if no custom arms) */}
    {!armL && <circle cx="-9" cy="35" r="4.2" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.8" />}
    {!armR && <circle cx="9" cy="35" r="4.2" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.8" />}
    {armL}
    {armR}

    {/* Head Group */}
    <g transform="translate(0, 4)">
      {/* Ears with smooth integration */}
      <path d="M -15 -8 C -19 -20 -10 -24 -4 -13 Z" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1.2" />
      <path d="M -13 -9 C -16 -18 -10 -20 -6 -13 Z" fill="#fbcfe8" />
      <path d="M 15 -8 C 19 -20 10 -24 4 -13 Z" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1.2" />
      <path d="M 13 -9 C 16 -18 10 -20 6 -13 Z" fill="#fbcfe8" />

      {/* Head Contour (Fluffy Cheeks) */}
      <path
        d="M -17 2 C -20 12 -12 18 0 18 C 12 18 20 12 17 2 C 17 -8 9 -14 0 -14 C -9 -14 -17 -8 -17 2 Z"
        fill="#ffffff"
        stroke="#e2e8f0"
        strokeWidth="1.2"
      />

      {/* Blush */}
      {hasBlush && (
        <>
          <ellipse cx="-11" cy="7" rx="3.5" ry="2" fill="#fca5a5" opacity="0.6" />
          <ellipse cx="11" cy="7" rx="3.5" ry="2" fill="#fca5a5" opacity="0.6" />
        </>
      )}

      {/* Eyes */}
      {eyeState === 'happy' && (
        <>
          <circle cx="-6.5" cy="2" r="3.2" fill="#0f172a" />
          <circle cx="-5.5" cy="0.8" r="1.1" fill="#ffffff" />
          <circle cx="-7.5" cy="3" r="0.6" fill="#ffffff" />
          <circle cx="6.5" cy="2" r="3.2" fill="#0f172a" />
          <circle cx="7.5" cy="0.8" r="1.1" fill="#ffffff" />
          <circle cx="5.5" cy="3" r="0.6" fill="#ffffff" />
        </>
      )}
      {eyeState === 'joy' && (
        <>
          <path d="M -9.5 2 Q -6.5 -2.5 -3.5 2" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <path d="M 3.5 2 Q 6.5 -2.5 9.5 2" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </>
      )}
      {eyeState === 'wink' && (
        <>
          <path d="M -9.5 2 Q -6.5 -2.5 -3.5 2" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <circle cx="6.5" cy="2" r="3.2" fill="#0f172a" />
          <circle cx="7.5" cy="0.8" r="1.1" fill="#ffffff" />
        </>
      )}
      {eyeState === 'wide' && (
        <>
          <circle cx="-6.5" cy="2" r="4.2" fill="#0f172a" />
          <circle cx="-5.5" cy="0.8" r="1.6" fill="#ffffff" />
          <circle cx="6.5" cy="2" r="4.2" fill="#0f172a" />
          <circle cx="7.5" cy="0.8" r="1.6" fill="#ffffff" />
        </>
      )}
      {eyeState === 'closed' && (
        <>
          <line x1="-9" y1="2" x2="-4" y2="2" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="4" y1="2" x2="9" y2="2" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}

      {/* Nose */}
      <polygon points="-1.5,5.5 1.5,5.5 0,7" fill="#f472b6" />

      {/* Mouth */}
      {mouth === '3' && (
        <path d="M -3 7.5 Q 0 9.5 0 7.5 Q 0 9.5 3 7.5" stroke="#475569" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      )}
      {mouth === 'open' && (
        <path d="M -3 7.5 Q 0 12 3 7.5 Z" fill="#ef4444" stroke="#475569" strokeWidth="0.8" />
      )}
      {mouth === 'tongue' && (
        <>
          <path d="M -3 7.5 Q 0 9.5 0 7.5 Q 0 9.5 3 7.5" stroke="#475569" strokeWidth="1.2" fill="none" />
          <path d="M -1 8.5 Q 0 12 2 10.5 Q 3 9 1 8.5 Z" fill="#f43f5e" />
        </>
      )}
    </g>
  </g>
);

/**
 * Black Cat Character Rig
 */
const CuteBlackCat = ({
  x = 0,
  y = 0,
  scale = 1,
  rotation = 0,
  eyeState = 'happy',
  mouth = '3',
  hasBlush = true,
  armL = null,
  armR = null,
  className = '',
}) => (
  <g transform={`translate(${x}, ${y}) scale(${scale}) rotate(${rotation})`} className={className}>
    {/* Haunches / Body */}
    <path
      d="M -15 14 C -22 22 -20 38 0 38 C 20 38 22 22 15 14 C 11 16 -11 16 -15 14 Z"
      fill="#1e293b"
    />
    {/* White Chest Ascot Patch (Tuxedo flair) */}
    <path d="M -4 18 Q 0 24 4 18 Q 0 26 -4 18 Z" fill="#f8fafc" />

    {/* Tail */}
    <path
      d="M -14 30 C -24 32 -26 20 -20 16"
      stroke="#1e293b"
      strokeWidth="4.5"
      strokeLinecap="round"
      fill="none"
      className="cat-tail-wag"
    />

    {/* Paws */}
    {!armL && <circle cx="-9" cy="35" r="4.2" fill="#1e293b" />}
    {!armR && <circle cx="9" cy="35" r="4.2" fill="#1e293b" />}
    {armL}
    {armR}

    {/* Head Group */}
    <g transform="translate(0, 4)">
      {/* Ears */}
      <path d="M -15 -8 C -19 -20 -10 -24 -4 -13 Z" fill="#1e293b" />
      <path d="M -13 -9 C -16 -18 -10 -20 -6 -13 Z" fill="#fbcfe8" />
      <path d="M 15 -8 C 19 -20 10 -24 4 -13 Z" fill="#1e293b" />
      <path d="M 13 -9 C 16 -18 10 -20 6 -13 Z" fill="#fbcfe8" />

      {/* Head Contour */}
      <path
        d="M -17 2 C -20 12 -12 18 0 18 C 12 18 20 12 17 2 C 17 -8 9 -14 0 -14 C -9 -14 -17 -8 -17 2 Z"
        fill="#1e293b"
      />

      {/* Blush */}
      {hasBlush && (
        <>
          <ellipse cx="-11" cy="7" rx="3.5" ry="2" fill="#f472b6" opacity="0.45" />
          <ellipse cx="11" cy="7" rx="3.5" ry="2" fill="#f472b6" opacity="0.45" />
        </>
      )}

      {/* Eyes: Vibrant Golden Anime Sparkle */}
      {eyeState === 'happy' && (
        <>
          <circle cx="-6.5" cy="2" r="3.6" fill="#fbbf24" />
          <circle cx="-6.5" cy="2" r="2.2" fill="#0f172a" />
          <circle cx="-5.5" cy="1" r="1.1" fill="#ffffff" />
          <circle cx="6.5" cy="2" r="3.6" fill="#fbbf24" />
          <circle cx="6.5" cy="2" r="2.2" fill="#0f172a" />
          <circle cx="7.5" cy="1" r="1.1" fill="#ffffff" />
        </>
      )}
      {eyeState === 'joy' && (
        <>
          <path d="M -9.5 2 Q -6.5 -2.5 -3.5 2" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M 3.5 2 Q 6.5 -2.5 9.5 2" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </>
      )}
      {eyeState === 'wink' && (
        <>
          <path d="M -9.5 2 Q -6.5 -2.5 -3.5 2" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <circle cx="6.5" cy="2" r="3.6" fill="#fbbf24" />
          <circle cx="6.5" cy="2" r="2.2" fill="#0f172a" />
          <circle cx="7.5" cy="1" r="1.1" fill="#ffffff" />
        </>
      )}
      {eyeState === 'wide' && (
        <>
          <circle cx="-6.5" cy="2" r="4.4" fill="#fbbf24" />
          <circle cx="-6.5" cy="2" r="2.8" fill="#0f172a" />
          <circle cx="-5.2" cy="0.8" r="1.4" fill="#ffffff" />
          <circle cx="6.5" cy="2" r="4.4" fill="#fbbf24" />
          <circle cx="6.5" cy="2" r="2.8" fill="#0f172a" />
          <circle cx="7.8" cy="0.8" r="1.4" fill="#ffffff" />
        </>
      )}
      {eyeState === 'closed' && (
        <>
          <line x1="-9" y1="2" x2="-4" y2="2" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="4" y1="2" x2="9" y2="2" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}

      {/* Nose */}
      <polygon points="-1.5,5.5 1.5,5.5 0,7" fill="#f472b6" />

      {/* Mouth */}
      {mouth === '3' && (
        <path d="M -3 7.5 Q 0 9.5 0 7.5 Q 0 9.5 3 7.5" stroke="#fda4af" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      )}
      {mouth === 'open' && (
        <path d="M -3 7.5 Q 0 12 3 7.5 Z" fill="#ef4444" stroke="#fda4af" strokeWidth="0.8" />
      )}
      {mouth === 'tongue' && (
        <>
          <path d="M -3 7.5 Q 0 9.5 0 7.5 Q 0 9.5 3 7.5" stroke="#fda4af" strokeWidth="1.2" fill="none" />
          <path d="M -1 8.5 Q 0 12 2 10.5 Q 3 9 1 8.5 Z" fill="#f43f5e" />
        </>
      )}
    </g>
  </g>
);

// ─── 15 MASTERPIECE ANIMATED SCENES ──────────────────────────────────────────

// 1. Basketball Dunk 🏀 (True Parabolic Leaping & Ball Bounce Physics)
const SceneBasketball = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="162" rx="100" ry="12" fill="rgba(15,23,42,0.14)" />

    {/* Basketball Hoop on Right */}
    <g transform="translate(228, 55)">
      <rect x="0" y="0" width="6" height="110" fill="#64748b" rx="2" />
      {/* Backboard */}
      <rect x="-3" y="-20" width="6" height="40" fill="#ffffff" stroke="#0284c7" strokeWidth="2" rx="1" />
      <rect x="-2" y="-10" width="4" height="20" fill="none" stroke="#ef4444" strokeWidth="1.5" />
      {/* Rim & Net */}
      <path d="M -30 10 L 0 10" stroke="#f97316" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M -30 10 L -24 38 L -6 38 L 0 10"
        stroke="#ffffff"
        strokeWidth="2"
        strokeDasharray="4 3"
        fill="rgba(255,255,255,0.25)"
        className="hoop-net-swish"
      />
    </g>

    {/* White Cat: Defense & Cheering on Left */}
    <CuteWhiteCat
      x={65}
      y={122}
      eyeState="joy"
      mouth="open"
      className="cat-guard-bounce"
      armL={<path d="M -12 20 Q -22 10 -16 2" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />}
      armR={<path d="M 12 20 Q 22 10 16 2" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />}
    />

    {/* Black Cat: High Flying Slam Dunk Arc */}
    <g className="cat-dunk-arc">
      <CuteBlackCat
        x={0}
        y={0}
        eyeState="happy"
        mouth="open"
        rotation={-18}
        armR={
          <g transform="translate(18, 0)">
            {/* Arms holding ball */}
            <path d="M -4 14 Q 8 2 12 -4" stroke="#1e293b" strokeWidth="5.5" strokeLinecap="round" />
            {/* Basketball */}
            <circle cx="16" cy="-8" r="12" fill="#ea580c" stroke="#9a3412" strokeWidth="1.5" />
            <path d="M 4 -8 L 28 -8 M 16 -20 L 16 4" stroke="#9a3412" strokeWidth="1.2" />
            <path d="M 8 -16 C 14 -12 18 -4 24 0" stroke="#9a3412" strokeWidth="1.2" fill="none" />
          </g>
        }
      />
    </g>
  </g>
);

// 2. Driving Car 🚗 (Sports Kart with Suspension & Spinning Wheels)
const SceneDriving = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="164" rx="105" ry="11" fill="rgba(15,23,42,0.14)" />

    {/* Speed Lines on Ground */}
    <g className="speed-lines-dash">
      <line x1="20" y1="168" x2="60" y2="168" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
      <line x1="100" y1="168" x2="160" y2="168" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
      <line x1="200" y1="168" x2="250" y2="168" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
    </g>

    {/* Sports Convertible Body */}
    <g className="car-chassis-bounce" transform="translate(55, 96)">
      {/* Car Hull */}
      <path
        d="M 5 36 C 15 18 45 18 60 18 L 125 18 C 145 18 160 28 168 38 L 172 52 C 172 56 165 56 155 56 L 15 56 C 5 56 0 52 0 45 Z"
        fill="#ef4444"
        stroke="#b91c1c"
        strokeWidth="2"
      />
      {/* Racing Stripe */}
      <rect x="0" y="38" width="170" height="7" fill="#ffffff" opacity="0.9" />

      {/* Aerodynamic Windshield */}
      <path d="M 90 18 L 115 -8 L 138 -8 L 130 18 Z" fill="rgba(186,230,253,0.65)" stroke="#38bdf8" strokeWidth="2" />

      {/* Wheels */}
      <g transform="translate(36, 56)">
        <circle cx="0" cy="0" r="15" fill="#0f172a" />
        <circle cx="0" cy="0" r="7" fill="#94a3b8" />
        <g className="wheel-spin-fast">
          <line x1="-7" y1="0" x2="7" y2="0" stroke="#ffffff" strokeWidth="2" />
          <line x1="0" y1="-7" x2="0" y2="7" stroke="#ffffff" strokeWidth="2" />
        </g>
      </g>
      <g transform="translate(138, 56)">
        <circle cx="0" cy="0" r="15" fill="#0f172a" />
        <circle cx="0" cy="0" r="7" fill="#94a3b8" />
        <g className="wheel-spin-fast">
          <line x1="-7" y1="0" x2="7" y2="0" stroke="#ffffff" strokeWidth="2" />
          <line x1="0" y1="-7" x2="0" y2="7" stroke="#ffffff" strokeWidth="2" />
        </g>
      </g>

      {/* Driver: White Cat (Steering with Aviator Goggles) */}
      <g transform="translate(108, 0)">
        <CuteWhiteCat
          x={0}
          y={0}
          eyeState="joy"
          mouth="open"
          armR={
            <g transform="translate(10, 18)">
              <ellipse cx="0" cy="0" rx="9" ry="4" fill="none" stroke="#1e293b" strokeWidth="3" />
            </g>
          }
        />
        {/* Aviator Goggles */}
        <rect x="-14" y="-2" width="12" height="7" rx="3" fill="rgba(56,189,248,0.7)" stroke="#0284c7" strokeWidth="1.5" />
        <rect x="2" y="-2" width="12" height="7" rx="3" fill="rgba(56,189,248,0.7)" stroke="#0284c7" strokeWidth="1.5" />
        <line x1="-2" y1="1" x2="2" y2="1" stroke="#0284c7" strokeWidth="2" />
      </g>

      {/* Passenger: Black Cat (Waving / Ears Pinned in Wind) */}
      <g transform="translate(54, 4)">
        <CuteBlackCat
          x={0}
          y={0}
          eyeState="happy"
          mouth="3"
          armL={<path d="M -8 14 Q -18 2 -14 -8" stroke="#1e293b" strokeWidth="5.5" strokeLinecap="round" />}
        />
      </g>

      {/* Exhaust Smoke Puffs */}
      <g transform="translate(-12, 48)">
        <g className="car-exhaust-puffs">
          <circle cx="0" cy="0" r="6" fill="#cbd5e1" opacity="0.8" />
          <circle cx="-14" cy="-4" r="8" fill="#cbd5e1" opacity="0.5" />
          <circle cx="-28" cy="-8" r="11" fill="#cbd5e1" opacity="0.25" />
        </g>
      </g>
    </g>
  </g>
);

// 3. Swimming & Snorkel 🏊 (Buoyant Waves, Duck Floatie & Bubbles)
const SceneSwimming = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="164" rx="100" ry="10" fill="rgba(56,189,248,0.2)" />

    {/* Undulating Water Waves */}
    <g className="water-sine-waves">
      <path
        d="M 15 130 C 45 120 75 140 105 130 C 135 120 165 140 195 130 C 225 120 255 140 275 130"
        stroke="#38bdf8"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 10 142 C 40 132 70 152 100 142 C 130 132 160 152 190 142 C 220 132 250 152 270 142"
        stroke="#0284c7"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
    </g>

    {/* White Cat: Snorkeling in Water */}
    <g className="cat-swim-paddle" transform="translate(85, 102)">
      <CuteWhiteCat x={0} y={0} eyeState="happy" mouth="3" />
      {/* Snorkel Mask & Tube */}
      <ellipse cx="0" cy="5" rx="14" ry="8" fill="rgba(56,189,248,0.4)" stroke="#0284c7" strokeWidth="2" />
      <path d="M 10 5 L 18 5 L 18 -18 Q 18 -26 12 -26" stroke="#f43f5e" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* Rising Oxygen Bubbles */}
      <circle cx="15" cy="-30" r="3" fill="rgba(255,255,255,0.85)" className="bubble-rise-1" />
      <circle cx="21" cy="-40" r="2.2" fill="rgba(255,255,255,0.85)" className="bubble-rise-2" />
    </g>

    {/* Black Cat: Chilling in Yellow Rubber Duck Floatie */}
    <g className="duck-floatie-bob" transform="translate(185, 96)">
      {/* Floatie Ring */}
      <ellipse cx="0" cy="24" rx="30" ry="16" fill="#facc15" stroke="#ca8a04" strokeWidth="2" />
      {/* Duck Head & Beak */}
      <g transform="translate(26, 12)">
        <circle cx="0" cy="0" r="10" fill="#facc15" stroke="#ca8a04" strokeWidth="1" />
        <ellipse cx="7" cy="2" rx="6" ry="3.5" fill="#f97316" />
        <circle cx="0" cy="-2" r="1.8" fill="#1e293b" />
      </g>
      {/* Black Cat Inside Floatie */}
      <CuteBlackCat x={0} y={-4} eyeState="joy" mouth="3" />
    </g>
  </g>
);

// 4. Sprinting Chase 🏃 (Dynamic Cartoon Gallop & Speed Dust)
const SceneChasing = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="162" rx="100" ry="10" fill="rgba(15,23,42,0.14)" />

    {/* White Cat: Sprinting ahead with tongue out */}
    <g className="cat-sprint-white" transform="translate(160, 105)">
      <CuteWhiteCat
        x={0}
        y={0}
        eyeState="wink"
        mouth="tongue"
        rotation={15}
        armL={<path d="M -10 24 Q -22 18 -16 12" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />}
        armR={<path d="M 10 24 Q 24 30 20 22" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />}
      />
      {/* Galloping Dust Cloud */}
      <g transform="translate(-25, 30)">
        <g className="dust-puff-anim">
          <circle cx="0" cy="0" r="6" fill="#cbd5e1" opacity="0.7" />
          <circle cx="-13" cy="-2" r="8" fill="#cbd5e1" opacity="0.4" />
        </g>
      </g>
    </g>

    {/* Black Cat: Chasing fiercely with outstretched paws */}
    <g className="cat-sprint-black" transform="translate(70, 105)">
      <CuteBlackCat
        x={0}
        y={0}
        eyeState="wide"
        mouth="open"
        rotation={20}
        armL={<path d="M 8 16 L 26 12" stroke="#1e293b" strokeWidth="5.5" strokeLinecap="round" />}
        armR={<path d="M 10 24 L 28 20" stroke="#1e293b" strokeWidth="5.5" strokeLinecap="round" />}
      />
    </g>
  </g>
);

// 5. Cheeky Rapid Paw Slap 😼 (The Cat Slap Meme with Articulated Arm)
const SceneSlapping = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="162" rx="90" ry="11" fill="rgba(15,23,42,0.14)" />

    {/* White Cat: Sitting deadpan getting tapped */}
    <g className="cat-slap-target" transform="translate(175, 115)">
      <CuteWhiteCat x={0} y={0} eyeState="happy" mouth="3" />
      {/* Comical sweat drop */}
      <path d="M -18 -4 Q -22 -12 -18 -15 Q -14 -12 -18 -4" fill="#38bdf8" />
    </g>

    {/* Black Cat: Mischievous Grin & Rapid Paw Tap */}
    <g className="cat-slap-attacker" transform="translate(95, 115)">
      <CuteBlackCat
        x={0}
        y={0}
        eyeState="joy"
        mouth="3"
        armR={
          <g className="rapid-slap-arm">
            {/* Articulated Arm & Rounded Paw */}
            <path d="M 10 18 C 24 14 36 10 46 8" stroke="#1e293b" strokeWidth="6.5" strokeLinecap="round" />
            <circle cx="48" cy="8" r="5" fill="#1e293b" />
            <circle cx="48" cy="8" r="2.5" fill="#fda4af" />
          </g>
        }
      />
    </g>

    {/* Comic impact stays between the cats instead of inheriting the attacker's offset. */}
    <g transform="translate(150, 118)">
      <g className="slap-impact-star">
        <polygon points="0,-8 2,-2 8,0 2,2 0,8 -2,2 -8,0 -2,-2" fill="#f59e0b" />
      </g>
    </g>
  </g>
);

// 6. Skateboarding Duo 🛹 (Banked Deck & Pumping Stance)
const SceneSkateboard = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="162" rx="95" ry="11" fill="rgba(15,23,42,0.14)" />

    {/* Skateboard Assembly */}
    <g className="skate-deck-tilt" transform="translate(75, 122)">
      {/* Maple Deck with Kicktails */}
      <path
        d="M -5 20 Q 65 14 135 20 Q 148 8 152 6 L 154 11 Q 140 24 130 25 L 0 25 Q -10 24 -15 11 Z"
        fill="#f59e0b"
        stroke="#b45309"
        strokeWidth="2"
      />
      {/* Grip Tape Stripe */}
      <rect x="10" y="18" width="115" height="3" fill="#1e293b" opacity="0.8" />
      {/* Wheels */}
      <circle cx="18" cy="28" r="7" fill="#38bdf8" stroke="#0284c7" strokeWidth="1.5" />
      <circle cx="115" cy="28" r="7" fill="#38bdf8" stroke="#0284c7" strokeWidth="1.5" />

      {/* White Cat: Front Surfer Stance */}
      <CuteWhiteCat
        x={100}
        y={-8}
        eyeState="joy"
        mouth="open"
        armL={<path d="M -12 18 Q -20 10 -16 4" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />}
        armR={<path d="M 12 18 Q 22 14 18 6" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />}
      />

      {/* Black Cat: Riding Kicktail Wheelie */}
      <CuteBlackCat
        x={35}
        y={-10}
        eyeState="happy"
        mouth="3"
        rotation={-8}
        armL={<path d="M -10 18 Q -16 6 -10 0" stroke="#1e293b" strokeWidth="5.5" strokeLinecap="round" />}
      />
    </g>
  </g>
);

// 7. Gym Weightlifting 🏋️ (Bending Tuna Barbell & Tremor Physics)
const SceneWeightlifting = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="162" rx="95" ry="11" fill="rgba(15,23,42,0.14)" />

    {/* Black Cat: Overhead Squat with Tremor */}
    <g className="gym-lifter-shake" transform="translate(105, 115)">
      <CuteBlackCat
        x={0}
        y={0}
        eyeState="joy"
        mouth="open"
        armL={<path d="M -10 18 L -16 -4" stroke="#1e293b" strokeWidth="5.5" strokeLinecap="round" />}
        armR={<path d="M 10 18 L 16 -4" stroke="#1e293b" strokeWidth="5.5" strokeLinecap="round" />}
      />

      {/* Bending Barbell with Giant Tuna Fish */}
      <g className="gym-barbell-tremble" transform="translate(0, -8)">
        {/* Bending Bar */}
        <path d="M -45 0 Q 0 8 45 0" stroke="#475569" strokeWidth="4" fill="none" />
        {/* Left Giant Tuna */}
        <g transform="translate(-48, 0) rotate(15)">
          <ellipse cx="0" cy="0" rx="14" ry="9" fill="#38bdf8" stroke="#0284c7" strokeWidth="1.5" />
          <polygon points="-12,0 -20,-8 -20,8" fill="#0284c7" />
          <circle cx="8" cy="-2" r="1.8" fill="#0f172a" />
        </g>
        {/* Right Giant Tuna */}
        <g transform="translate(48, 0) rotate(-15)">
          <ellipse cx="0" cy="0" rx="14" ry="9" fill="#38bdf8" stroke="#0284c7" strokeWidth="1.5" />
          <polygon points="12,0 20,-8 20,8" fill="#0284c7" />
          <circle cx="-8" cy="-2" r="1.8" fill="#0f172a" />
        </g>
      </g>
    </g>

    {/* White Cat: Coach with Whistle & Cheer Flag */}
    <g className="gym-coach-bounce" transform="translate(195, 115)">
      <CuteWhiteCat
        x={0}
        y={0}
        eyeState="happy"
        mouth="open"
        armL={
          <g transform="translate(-10, 16)">
            {/* Cheer Flag */}
            <line x1="0" y1="8" x2="0" y2="-24" stroke="#78350f" strokeWidth="2.5" />
            <polygon points="0,-24 22,-14 0,-4" fill="#ef4444" />
          </g>
        }
      />
    </g>
  </g>
);

// 8. Fishing Fun 🎣 (Cantilever Bending Rod & Leaping Fish)
const SceneFishing = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="162" rx="95" ry="11" fill="rgba(15,23,42,0.14)" />

    {/* Pier Edge */}
    <rect x="40" y="148" width="80" height="15" fill="#a16207" rx="2" />
    <line x1="60" y1="148" x2="60" y2="168" stroke="#78350f" strokeWidth="4" />
    <line x1="100" y1="148" x2="100" y2="168" stroke="#78350f" strokeWidth="4" />

    {/* White Cat: Fishing Rod in Paws */}
    <g transform="translate(85, 112)">
      <CuteWhiteCat
        x={0}
        y={0}
        eyeState="joy"
        mouth="open"
        armR={
          <g transform="translate(8, 14)">
            {/* Bending Bamboo Rod */}
            <path d="M 0 0 Q 30 -22 65 -28" stroke="#ca8a04" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            {/* Line down to flapping fish */}
            <path d="M 65 -28 Q 75 12 90 0" stroke="#94a3b8" strokeWidth="1.2" fill="none" />
            {/* Leaping Flapping Fish */}
            <g transform="translate(88, 0)">
              <g className="fish-jump-flap">
                <ellipse cx="0" cy="0" rx="14" ry="8" fill="#38bdf8" stroke="#0284c7" strokeWidth="1.2" />
                <polygon points="12,0 20,-6 20,6" fill="#0284c7" />
                <circle cx="-7" cy="-2" r="1.6" fill="#0f172a" />
                {/* Splash droplets */}
                <circle cx="-12" cy="10" r="2" fill="#38bdf8" />
                <circle cx="4" cy="12" r="1.5" fill="#38bdf8" />
              </g>
            </g>
          </g>
        }
      />
    </g>

    {/* Black Cat: Holding Bucket Waiting to Eat */}
    <g className="cat-bucket-hop" transform="translate(195, 115)">
      <CuteBlackCat
        x={0}
        y={0}
        eyeState="wide"
        mouth="open"
        armL={
          <g transform="translate(-10, 16)">
            <polygon points="-8,10 8,10 6,24 -6,24" fill="#94a3b8" stroke="#64748b" strokeWidth="1.5" />
          </g>
        }
      />
    </g>
  </g>
);

// 9. UFO Alien Tractor Beam 🛸 (Hover Saucer & Weightless Levitation)
const SceneUFO = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="162" rx="90" ry="11" fill="rgba(15,23,42,0.14)" />

    {/* Tractor Beam with Glowing Particle Rings */}
    <polygon points="125,55 155,55 185,160 95,160" fill="rgba(74,222,128,0.22)" className="ufo-beam-glow" />

    {/* Flying Saucer with Black Cat Pilot */}
    <g className="ufo-hover-drift" transform="translate(140, 48)">
      {/* Cockpit Dome */}
      <path d="M -18 0 A 18 18 0 0 1 18 0 Z" fill="rgba(186,230,253,0.75)" stroke="#38bdf8" strokeWidth="2" />
      {/* Black Cat Inside with Alien Antenna */}
      <CuteBlackCat x={0} y={-3} scale={0.75} eyeState="joy" mouth="3" />
      <line x1="0" y1="-18" x2="0" y2="-24" stroke="#4ade80" strokeWidth="2" />
      <circle cx="0" cy="-25" r="3" fill="#4ade80" />

      {/* Saucer Hull */}
      <ellipse cx="0" cy="6" rx="42" ry="12" fill="#8b5cf6" stroke="#6d28d9" strokeWidth="2" />
      {/* Blinking Saucer Lights */}
      <circle cx="-25" cy="6" r="3" fill="#fde047" className="ufo-light-1" />
      <circle cx="0" cy="8" r="3" fill="#fde047" className="ufo-light-2" />
      <circle cx="25" cy="6" r="3" fill="#fde047" className="ufo-light-3" />
    </g>

    {/* White Cat: Weightlessly Levitating in Beam */}
    <g className="cat-ufo-float" transform="translate(140, 110)">
      <CuteWhiteCat
        x={0}
        y={0}
        eyeState="wide"
        mouth="open"
        rotation={-6}
        armL={<path d="M -12 16 Q -22 10 -18 2" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />}
        armR={<path d="M 12 16 Q 22 10 18 2" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />}
      />
    </g>
  </g>
);

// 10. Console Gaming 🎮 (Game Controllers, Button Mash & 1P/2P)
const SceneGaming = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="162" rx="95" ry="11" fill="rgba(15,23,42,0.14)" />

    {/* White Cat: Player 1 */}
    <g className="game-cat-p1" transform="translate(95, 112)">
      <CuteWhiteCat
        x={0}
        y={0}
        eyeState="happy"
        mouth="open"
        armR={
          <g transform="translate(12, 16)">
            {/* Cyan Game Controller */}
            <rect x="-8" y="-5" width="18" height="10" rx="3" fill="#0284c7" />
            <circle cx="-3" cy="0" r="1.5" fill="#facc15" />
            <circle cx="4" cy="0" r="1.5" fill="#ef4444" />
          </g>
        }
      />
      <text x="-6" y="-22" fontSize="10" fontWeight="bold" fill="#0284c7">1P</text>
    </g>

    {/* Black Cat: Player 2 */}
    <g className="game-cat-p2" transform="translate(185, 112)">
      <CuteBlackCat
        x={0}
        y={0}
        eyeState="joy"
        mouth="open"
        armL={
          <g transform="translate(-12, 16)">
            {/* Red Game Controller */}
            <rect x="-10" y="-5" width="18" height="10" rx="3" fill="#dc2626" />
            <circle cx="-5" cy="0" r="1.5" fill="#facc15" />
            <circle cx="3" cy="0" r="1.5" fill="#38bdf8" />
          </g>
        }
      />
      <text x="-6" y="-22" fontSize="10" fontWeight="bold" fill="#dc2626">2P</text>
    </g>

    {/* Floating Clash Sparks */}
    <g className="gaming-clash-sparks" transform="translate(140, 95)">
      <polygon points="0,-7 2,-2 7,0 2,2 0,7 -2,2 -7,0 -2,-2" fill="#eab308" />
    </g>
  </g>
);

// 11. Ramen Slurping 🍜 (Japanese Bowl, Springy Noodles & Swirling Steam)
const SceneRamen = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="162" rx="95" ry="11" fill="rgba(15,23,42,0.14)" />

    {/* Giant Ceramic Ramen Bowl */}
    <g transform="translate(140, 130)">
      <path d="M -32 0 C -32 26 32 26 32 0 Z" fill="#ef4444" stroke="#b91c1c" strokeWidth="2.5" />
      <ellipse cx="0" cy="0" rx="32" ry="10" fill="#fef08a" stroke="#ca8a04" strokeWidth="1.5" />
      {/* Ajitsuke Tamago (Egg) */}
      <circle cx="-8" cy="-1" r="5" fill="#ffffff" />
      <circle cx="-8" cy="-1" r="2.8" fill="#f97316" />
      {/* Nori Sheet */}
      <rect x="12" y="-7" width="10" height="8" fill="#15803d" rx="1" />

      {/* Swirling Steam */}
      <path d="M -6 -16 Q -12 -25 -4 -32" stroke="#cbd5e1" strokeWidth="2" fill="none" strokeLinecap="round" className="steam-curl-1" />
      <path d="M 8 -16 Q 14 -25 6 -32" stroke="#cbd5e1" strokeWidth="2" fill="none" strokeLinecap="round" className="steam-curl-2" />
    </g>

    {/* White Cat Slurping Left */}
    <g transform="translate(80, 114)">
      <g className="slurp-cat-left">
        <CuteWhiteCat x={0} y={0} eyeState="happy" mouth="3" />
        <path d="M 4 8 Q 28 14 38 18" stroke="#facc15" strokeWidth="3" fill="none" strokeLinecap="round" className="noodle-spring" />
      </g>
    </g>

    {/* Black Cat Slurping Right */}
    <g transform="translate(200, 114)">
      <g className="slurp-cat-right">
        <CuteBlackCat x={0} y={0} eyeState="joy" mouth="3" />
        <path d="M -4 8 Q -28 14 -38 18" stroke="#facc15" strokeWidth="3" fill="none" strokeLinecap="round" className="noodle-spring" />
      </g>
    </g>
  </g>
);

// 12. Cardboard Box Battle 📦 (Squishing & Box Bulging Physics)
const SceneBox = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="162" rx="90" ry="11" fill="rgba(15,23,42,0.14)" />

    {/* Cardboard Box with Wobble Animation */}
    <g transform="translate(140, 124)">
      <g className="box-squish-wobble">
      {/* Box Hull */}
      <rect x="-40" y="0" width="80" height="38" rx="4" fill="#d97706" stroke="#b45309" strokeWidth="2.5" />
      {/* Box Flaps */}
      <polygon points="-40,0 -54,-10 -40,-8" fill="#b45309" />
      <polygon points="40,0 54,-10 40,-8" fill="#b45309" />
      {/* Fish logo */}
      <ellipse cx="0" cy="18" rx="10" ry="5" fill="#fef3c7" />

      {/* White Cat Squished Inside Front */}
      <g transform="translate(-16, -10)">
        <CuteWhiteCat x={0} y={0} eyeState="wink" mouth="open" scale={0.9} />
      </g>

      {/* Black Cat Squished Inside Back */}
      <g transform="translate(20, -10)">
        <CuteBlackCat x={0} y={0} eyeState="joy" mouth="3" scale={0.9} />
      </g>

      {/* Wagging Tails poking out */}
      <g transform="translate(-46, 22)">
        <path d="M 0 0 Q -12 -12 -6 -18" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" fill="none" className="tail-wag-fast tail-wag-left" />
      </g>
      <g transform="translate(46, 22)">
        <path d="M 0 0 Q 12 -12 6 -18" stroke="#1e293b" strokeWidth="5" strokeLinecap="round" fill="none" className="tail-wag-fast tail-wag-right" />
      </g>
      </g>
    </g>
  </g>
);

// 13. Riding Roomba Vacuum 🧹 (Figure-8 Navigation & Blinking Lights)
const SceneRoomba = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="162" rx="95" ry="11" fill="rgba(15,23,42,0.14)" />

    {/* Roomba Gliding with Smooth Patrol */}
    <g className="roomba-patrol-loop" transform="translate(140, 120)">
      {/* Robot Disc */}
      <ellipse cx="0" cy="24" rx="52" ry="16" fill="#334155" stroke="#0f172a" strokeWidth="2.5" />
      <circle cx="0" cy="24" r="7" fill="#38bdf8" className="roomba-sensor-pulse" />
      {/* Side Spinning Brushes */}
      <circle cx="-42" cy="32" r="4" fill="#94a3b8" />
      <circle cx="42" cy="32" r="4" fill="#94a3b8" />

      {/* White Cat: Captain with Sailor Hat */}
      <g transform="translate(-18, 2)">
        <CuteWhiteCat x={0} y={0} eyeState="happy" mouth="3" />
        {/* Cute Captain Hat */}
        <ellipse cx="0" cy="-14" rx="10" ry="3" fill="#ffffff" stroke="#0f172a" strokeWidth="1.2" />
        <rect x="-6" y="-18" width="12" height="5" fill="#0f172a" rx="1" />
      </g>

      {/* Black Cat: Wakeboarding / Surfing behind */}
      <g transform="translate(24, 4)">
        <CuteBlackCat
          x={0}
          y={0}
          eyeState="joy"
          mouth="open"
          armR={<path d="M 10 18 Q 20 8 16 0" stroke="#1e293b" strokeWidth="5.5" strokeLinecap="round" />}
        />
      </g>
    </g>
  </g>
);

// 14. Sleeping & Snuggling 💤 (Harmonious Yin-Yang Breathing & Zzz)
const SceneSleeping = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="162" rx="95" ry="11" fill="rgba(15,23,42,0.14)" />

    {/* Curled Yin-Yang Hug with Synchronized Breathing */}
    <g className="sleep-breathing-sync" transform="translate(140, 118)">
      {/* White Cat Curled Left */}
      <g transform="translate(-20, 10) rotate(18)">
        <CuteWhiteCat x={0} y={0} eyeState="joy" mouth="3" />
      </g>

      {/* Black Cat Curled Right */}
      <g transform="translate(20, 10) rotate(-18)">
        <CuteBlackCat x={0} y={0} eyeState="joy" mouth="3" />
      </g>

      {/* Rising Zzz Bubbles */}
      <g className="zzz-float-up">
        <text x="-6" y="-22" fontSize="12" fontWeight="bold" fill="#a855f7">z</text>
        <text x="6" y="-34" fontSize="16" fontWeight="bold" fill="#a855f7">Z</text>
        <text x="20" y="-48" fontSize="20" fontWeight="bold" fill="#c084fc">Z</text>
      </g>
    </g>
  </g>
);

// 15. Rocket Blastoff 🚀 (Space Vehicle, Exhaust Plume & Starry Sky)
const SceneRocket = () => (
  <g className="scene-container">
    <ellipse cx="140" cy="162" rx="90" ry="11" fill="rgba(15,23,42,0.14)" />

    {/* Blasting Space Rocket */}
    <g className="rocket-vibration" transform="translate(140, 92)">
      {/* Exhaust Flame & Billow */}
      <polygon points="-10,48 10,48 0,80" fill="#ef4444" className="rocket-flame-flicker" />
      <polygon points="-5,48 5,48 0,66" fill="#facc15" className="rocket-flame-core" />

      {/* Rocket Hull */}
      <path d="M 0 -45 Q 24 8 24 48 L -24 48 Q -24 8 0 -45 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
      <path d="M 0 -45 Q 14 -16 18 -8 L -18 -8 Q -14 -16 0 -45 Z" fill="#ef4444" />
      {/* Fins */}
      <polygon points="-24,28 -38,50 -24,50" fill="#ef4444" />
      <polygon points="24,28 38,50 24,50" fill="#ef4444" />

      {/* Window Porthole: White Cat Astronaut */}
      <circle cx="0" cy="8" r="14" fill="#38bdf8" stroke="#0284c7" strokeWidth="2.5" />
      <CuteWhiteCat x={0} y={10} scale={0.7} eyeState="joy" mouth="open" />

      {/* Black Cat: Daredevil Holding Outside Ladder */}
      <g transform="translate(26, 20) rotate(14)">
        <CuteBlackCat x={0} y={0} scale={0.75} eyeState="happy" mouth="3" />
      </g>
    </g>
  </g>
);

// ─── Scene Selector Map ──────────────────────────────────────────────────────
const SCENE_COMPONENTS = {
  basketball: SceneBasketball,
  driving: SceneDriving,
  swimming: SceneSwimming,
  chasing: SceneChasing,
  slapping: SceneSlapping,
  skateboard: SceneSkateboard,
  weightlifting: SceneWeightlifting,
  fishing: SceneFishing,
  ufo: SceneUFO,
  gaming: SceneGaming,
  ramen: SceneRamen,
  box: SceneBox,
  roomba: SceneRoomba,
  sleeping: SceneSleeping,
  rocket: SceneRocket,
};

// ─── Main LoadingModal Component ─────────────────────────────────────────────
export const LoadingModal = ({ isOpen, message = '', operation = 'auto' }) => {
  const [actionIndex, setActionIndex] = useState(() => getRandomCatActionIndex());

  const handleNextAction = () => {
    setActionIndex((prev) => getAdjacentCatActionIndex(prev, 1));
  };

  const handleRandomAction = (e) => {
    e.stopPropagation();
    setActionIndex((prev) => getRandomCatActionIndex(prev));
  };

  if (!isOpen) return null;

  const currentAction = getCatActionByIndex(actionIndex);
  const SceneComponent = SCENE_COMPONENTS[currentAction.id] || SceneBasketball;
  const presentation = getLoaderPresentation({ operation, message });

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden select-none"
      role="status"
      aria-live="polite"
      aria-label={`${presentation.label}: ${presentation.message}`}
    >
      {/* ── Soft Ambient Backdrop ── */}
      <div className="cat-modal-backdrop" />

      {/* ── Frosted Glass Card ── */}
      <div className="cat-modal-card">
        {/* Action Title Badge (Clickable for Instant Fun Shuffle) */}
        <button
          type="button"
          onClick={handleRandomAction}
          className="cat-action-badge group"
          title="คลิกเพื่อสุ่มกิจกรรมอื่น 🎲"
        >
          <span className="text-base">{currentAction.emoji}</span>
          <span className="font-semibold text-slate-700 text-xs md:text-sm">
            {currentAction.title}
          </span>
          <span className="text-[11px] text-slate-400 group-hover:text-blue-600 transition-colors ml-1">
            🎲
          </span>
        </button>

        {/* ── 60FPS SVG Animated Scene ── */}
        <div
          className="cat-scene-wrapper cursor-pointer"
          onClick={handleNextAction}
          title="คลิกฉากเพื่อดูท่าถัดไป 🐾"
        >
          <svg
            viewBox="0 0 280 190"
            className="w-[300px] h-[200px] max-w-full overflow-hidden transition-transform duration-200 hover:scale-105"
          >
            <SceneComponent />
          </svg>
        </div>

        {/* ── Message Pill with Animated Ellipsis ── */}
        <div className={`cat-msg-pill cat-msg-pill--${presentation.type}`}>
          <span className="cat-operation-chip">
            <span className="cat-operation-icon" aria-hidden="true">{presentation.icon}</span>
            {presentation.label}
          </span>
          <p className="cat-msg-text">
            <span>{presentation.message}</span>
            <span className="cat-dot-flair">
              <span className="dot dot-1">.</span>
              <span className="dot dot-2">.</span>
              <span className="dot dot-3">.</span>
            </span>
          </p>
        </div>

        <p className="text-[11px] text-slate-400 -mt-1 flex items-center gap-1">
          <span>คู่หูแมวขาว-ดำ สุ่ม 15 กิจกรรม</span>
          <span>🐾</span>
        </p>
      </div>

      <style>{`
/* ═══════════ BACKDROP & CARD ═══════════ */
.cat-modal-backdrop {
  position: absolute; inset: 0;
  background: radial-gradient(circle at center, rgba(241, 245, 249, 0.65) 0%, rgba(226, 232, 240, 0.75) 100%);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  animation: backdropFadeIn 0.3s ease-out both;
}
@keyframes backdropFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.cat-modal-card {
  position: relative; z-index: 10;
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  padding: 26px 30px 22px;
  max-width: 390px; width: calc(100% - 32px);
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(24px) saturate(190%);
  -webkit-backdrop-filter: blur(24px) saturate(190%);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 36px;
  box-shadow:
    0 24px 64px -12px rgba(15, 23, 42, 0.12),
    0 8px 24px -4px rgba(15, 23, 42, 0.06),
    0 0 0 1px rgba(255, 255, 255, 0.7) inset;
  animation: cardSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes cardSlideUp {
  from { opacity: 0; transform: translateY(20px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ═══════════ BADGE & PILL ═══════════ */
.cat-action-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 14px;
  background: rgba(241, 245, 249, 0.85);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 9999px;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.cat-action-badge:hover {
  background: #ffffff;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
}

.cat-msg-pill {
  --loader-accent: #2563eb;
  --loader-soft: rgba(219, 234, 254, 0.78);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  min-width: min(292px, 100%); max-width: 100%;
  padding: 8px 18px 9px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid color-mix(in srgb, var(--loader-accent) 22%, white);
  border-radius: 20px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
}
.cat-msg-pill--saving {
  --loader-accent: #059669;
  --loader-soft: rgba(209, 250, 229, 0.82);
}
.cat-msg-pill--syncing {
  --loader-accent: #7c3aed;
  --loader-soft: rgba(237, 233, 254, 0.86);
}
.cat-operation-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 9px;
  border-radius: 9999px;
  background: var(--loader-soft);
  color: var(--loader-accent);
  font-size: 11px; font-weight: 800; line-height: 1.45;
}
.cat-operation-icon {
  display: inline-grid; place-items: center;
  width: 14px; height: 14px;
  font-size: 12px; line-height: 1;
}
.cat-msg-pill--syncing .cat-operation-icon {
  animation: syncIconSpin 1.1s linear infinite;
}
@keyframes syncIconSpin {
  to { transform: rotate(360deg); }
}
.cat-msg-text {
  font-weight: 600; font-size: 14px;
  letter-spacing: -0.01em; color: #1e293b;
  display: flex; align-items: center; justify-content: center; gap: 2px;
  max-width: 100%; text-align: center; overflow-wrap: anywhere;
}
.cat-dot-flair { display: inline-flex; margin-left: 2px; }
.cat-dot-flair .dot { animation: dotBlink 1.4s infinite; opacity: 0; }
.cat-dot-flair .dot-1 { animation-delay: 0s; }
.cat-dot-flair .dot-2 { animation-delay: 0.22s; }
.cat-dot-flair .dot-3 { animation-delay: 0.44s; }
@keyframes dotBlink {
  0%, 100% { opacity: 0.2; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-1px); }
}

/* ═══════════ BIOMECHANICS & PHYSICS ═══════════ */

/* Tail Wag */
.cat-tail-wag {
  animation: tailWagSmooth 1.6s ease-in-out infinite alternate;
  transform-origin: -14px 30px;
}
@keyframes tailWagSmooth {
  0% { transform: rotate(-8deg); }
  100% { transform: rotate(12deg); }
}
.tail-wag-fast {
  animation: tailWagF 0.5s ease-in-out infinite alternate;
  transform-origin: 0 0;
}
@keyframes tailWagF {
  0% { transform: rotate(-8deg); }
  100% { transform: rotate(10deg); }
}
.tail-wag-right { animation-direction: alternate-reverse; }

/* 1. Basketball Dunk */
.cat-dunk-arc {
  animation: dunkParabola 2.2s cubic-bezier(0.25, 1, 0.5, 1) infinite;
}
@keyframes dunkParabola {
  0% { transform: translate(110px, 125px) scale(1.1, 0.9); }
  20% { transform: translate(140px, 45px) scale(0.9, 1.15); }
  45% { transform: translate(195px, 42px) scale(1.05, 0.95); }
  65% { transform: translate(205px, 125px) scale(1.15, 0.85); }
  85%, 100% { transform: translate(110px, 125px) scale(1, 1); }
}
.cat-guard-bounce {
  animation: guardStance 1.1s ease-in-out infinite alternate;
}
@keyframes guardStance {
  0% { transform: translate(65px, 124px) scaleY(0.97); }
  100% { transform: translate(65px, 118px) scaleY(1.03); }
}
.hoop-net-swish {
  animation: netSwish 2.2s ease-in-out infinite;
}
@keyframes netSwish {
  0%, 40% { transform: skewX(0); }
  48% { transform: skewX(8deg) scaleY(1.15); }
  60% { transform: skewX(-4deg) scaleY(0.95); }
  75%, 100% { transform: skewX(0); }
}

/* 2. Driving Car */
.car-chassis-bounce {
  animation: kartChassis 0.35s ease-in-out infinite alternate;
}
@keyframes kartChassis {
  0% { transform: translate(55px, 97px); }
  100% { transform: translate(55px, 94px); }
}
.wheel-spin-fast {
  animation: wheelSpinF 0.4s linear infinite;
  transform-box: fill-box;
  transform-origin: center;
}
@keyframes wheelSpinF {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.speed-lines-dash {
  animation: speedDash 0.3s linear infinite;
}
@keyframes speedDash {
  0% { transform: translateX(0); }
  100% { transform: translateX(-40px); }
}
.car-exhaust-puffs {
  animation: exhaustPuffs 0.4s ease-out infinite;
}
@keyframes exhaustPuffs {
  0% { opacity: 0.8; transform: translate(0, 0) scale(0.8); }
  100% { opacity: 0.1; transform: translate(-14px, -4px) scale(1.15); }
}

/* 3. Swimming */
.water-sine-waves {
  animation: waveUndulate 2.4s ease-in-out infinite alternate;
}
@keyframes waveUndulate {
  0% { transform: translateX(-10px); }
  100% { transform: translateX(10px); }
}
.cat-swim-paddle {
  animation: swimPaddle 2.2s ease-in-out infinite alternate;
}
@keyframes swimPaddle {
  0% { transform: translate(85px, 105px) rotate(-3deg); }
  100% { transform: translate(85px, 98px) rotate(3deg); }
}
.duck-floatie-bob {
  animation: duckBob 2s ease-in-out infinite alternate;
}
@keyframes duckBob {
  0% { transform: translate(185px, 94px) rotate(2deg); }
  100% { transform: translate(185px, 100px) rotate(-2deg); }
}
.bubble-rise-1 { animation: bubbleUp 1.8s ease-in infinite; }
.bubble-rise-2 { animation: bubbleUp 2.2s ease-in infinite 0.7s; }
@keyframes bubbleUp {
  0% { opacity: 0.8; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-24px) scale(1.4); }
}

/* 4. Sprinting Chase */
.cat-sprint-white {
  animation: sprintGallopW 0.5s ease-in-out infinite alternate;
}
@keyframes sprintGallopW {
  0% { transform: translate(155px, 102px) rotate(12deg) scale(1.04, 0.96); }
  100% { transform: translate(165px, 107px) rotate(18deg) scale(0.96, 1.04); }
}
.cat-sprint-black {
  animation: sprintGallopB 0.5s ease-in-out infinite alternate 0.12s;
}
@keyframes sprintGallopB {
  0% { transform: translate(65px, 103px) rotate(16deg) scale(1.04, 0.96); }
  100% { transform: translate(75px, 108px) rotate(22deg) scale(0.96, 1.04); }
}
.dust-puff-anim {
  animation: dustPop 0.5s ease-out infinite;
}
@keyframes dustPop {
  0% { opacity: 0.7; transform: translate(0, 0) scale(0.65); }
  100% { opacity: 0; transform: translate(-12px, -5px) scale(1.2); }
}

/* 5. Cheeky Paw Slap */
.rapid-slap-arm {
  animation: rapidSlapCycle 0.32s ease-in-out infinite alternate;
  transform-origin: 10px 18px;
}
@keyframes rapidSlapCycle {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(20deg); }
}
.cat-slap-target {
  animation: slapReaction 0.32s ease-in-out infinite alternate;
}
@keyframes slapReaction {
  0% { transform: translate(175px, 115px) rotate(0deg); }
  100% { transform: translate(177px, 117px) rotate(2deg) scale(1.02, 0.96); }
}
.slap-impact-star {
  animation: starBurst 0.32s ease-out infinite alternate;
}
@keyframes starBurst {
  0% { opacity: 0; transform: scale(0.4) rotate(-12deg); }
  100% { opacity: 1; transform: scale(1.2) rotate(12deg); }
}

/* 6. Skateboard */
.skate-deck-tilt {
  animation: deckLean 2s ease-in-out infinite alternate;
}
@keyframes deckLean {
  0% { transform: translate(65px, 122px) rotate(-3deg); }
  100% { transform: translate(85px, 122px) rotate(3deg); }
}

/* 7. Gym Weightlifting */
.gym-lifter-shake {
  animation: muscleTremor 0.14s ease-in-out infinite alternate;
}
@keyframes muscleTremor {
  0% { transform: translate(104px, 115px); }
  100% { transform: translate(106px, 114px); }
}
.gym-barbell-tremble {
  animation: barbellDip 1.8s ease-in-out infinite;
}
@keyframes barbellDip {
  0%, 100% { transform: translateY(-8px); }
  50% { transform: translateY(4px); }
}
.gym-coach-bounce {
  animation: coachHop 0.9s ease-in-out infinite alternate;
}
@keyframes coachHop {
  0% { transform: translate(195px, 118px); }
  100% { transform: translate(195px, 110px); }
}

/* 8. Fishing */
.fish-jump-flap {
  animation: fishFlapping 0.28s ease-in-out infinite alternate;
  transform-box: fill-box;
  transform-origin: center;
}
@keyframes fishFlapping {
  0% { transform: translateY(0) rotate(-12deg); }
  100% { transform: translateY(-4px) rotate(12deg); }
}
.cat-bucket-hop {
  animation: bucketExcited 0.7s ease-in-out infinite alternate;
}
@keyframes bucketExcited {
  0% { transform: translate(195px, 117px) scaleY(0.96); }
  100% { transform: translate(195px, 112px) scaleY(1.04); }
}

/* 9. UFO */
.ufo-hover-drift {
  animation: ufoDrift 2.6s ease-in-out infinite alternate;
}
@keyframes ufoDrift {
  0% { transform: translate(135px, 45px) rotate(-2deg); }
  100% { transform: translate(145px, 50px) rotate(2deg); }
}
.ufo-beam-glow {
  animation: beamPulsing 1.6s ease-in-out infinite alternate;
}
.ufo-light-1, .ufo-light-2, .ufo-light-3 {
  animation: ufoLightBlink 0.9s ease-in-out infinite alternate;
}
.ufo-light-2 { animation-delay: 0.3s; }
.ufo-light-3 { animation-delay: 0.6s; }
@keyframes ufoLightBlink {
  0% { opacity: 0.35; }
  100% { opacity: 1; }
}
@keyframes beamPulsing {
  0% { opacity: 0.15; }
  100% { opacity: 0.38; }
}
.cat-ufo-float {
  animation: catLevitate 2.8s ease-in-out infinite alternate;
}
@keyframes catLevitate {
  0% { transform: translate(140px, 122px) rotate(-4deg); }
  100% { transform: translate(140px, 92px) rotate(4deg); }
}

/* 10. Gaming */
.game-cat-p1 {
  animation: gamerP1Lean 0.4s ease-in-out infinite alternate;
}
@keyframes gamerP1Lean {
  0% { transform: translate(95px, 113px) rotate(-2deg); }
  100% { transform: translate(95px, 110px) rotate(2deg); }
}
.game-cat-p2 {
  animation: gamerP2Lean 0.35s ease-in-out infinite alternate;
}
@keyframes gamerP2Lean {
  0% { transform: translate(185px, 111px) rotate(2deg); }
  100% { transform: translate(185px, 114px) rotate(-2deg); }
}
.gaming-clash-sparks {
  animation: clashSparks 0.35s ease-out infinite alternate;
}
@keyframes clashSparks {
  0% { opacity: 0.2; transform: translate(140px, 95px) scale(0.6); }
  100% { opacity: 1; transform: translate(140px, 95px) scale(1.3); }
}

/* 11. Ramen */
.steam-curl-1 { animation: steamRiseUp 1.6s ease-out infinite; }
.steam-curl-2 { animation: steamRiseUp 1.6s ease-out infinite 0.8s; }
@keyframes steamRiseUp {
  0% { opacity: 0.7; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-14px); }
}
.noodle-spring {
  animation: noodleSlurp 0.35s ease-in-out infinite alternate;
}
@keyframes noodleSlurp {
  0% { stroke-width: 2.5px; }
  100% { stroke-width: 3.5px; }
}
.slurp-cat-left {
  animation: slurpCheeks 0.35s ease-in-out infinite alternate;
}
.slurp-cat-right {
  animation: slurpCheeks 0.35s ease-in-out infinite alternate 0.15s;
}
@keyframes slurpCheeks {
  0% { transform: translateY(0) scale(1, 1); }
  100% { transform: translateY(-2px) scale(1.03, 0.98); }
}

/* 12. Box Battle */
.box-squish-wobble {
  animation: boxWobbleSquish 1.2s ease-in-out infinite alternate;
  transform-box: fill-box;
  transform-origin: center bottom;
}
@keyframes boxWobbleSquish {
  0% { transform: rotate(-2deg) scale(1.02, 0.98); }
  100% { transform: rotate(2deg) scale(0.98, 1.02); }
}

/* 13. Roomba */
.roomba-patrol-loop {
  animation: roombaGlidePatrol 3.4s ease-in-out infinite alternate;
}
@keyframes roombaGlidePatrol {
  0% { transform: translate(110px, 120px); }
  100% { transform: translate(170px, 120px); }
}
.roomba-sensor-pulse {
  animation: sensorBlink 0.8s ease-in-out infinite alternate;
}
@keyframes sensorBlink {
  0% { opacity: 0.3; }
  100% { opacity: 1; }
}

/* 14. Sleeping */
.sleep-breathing-sync {
  animation: sleepBreathingCycle 3.4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
}
@keyframes sleepBreathingCycle {
  0%, 100% { transform: translate(140px, 118px) scale(1, 1); }
  45% { transform: translate(140px, 115px) scale(1.03, 1.04); }
  75% { transform: translate(140px, 117px) scale(1.01, 1.01); }
}
.zzz-float-up {
  animation: zzzDrifting 2.8s ease-in-out infinite;
}
@keyframes zzzDrifting {
  0% { opacity: 0; transform: translateY(6px); }
  40% { opacity: 0.9; }
  100% { opacity: 0; transform: translateY(-20px); }
}

/* 15. Rocket */
.rocket-vibration {
  animation: rocketEngineRumble 0.12s ease-in-out infinite alternate;
}
@keyframes rocketEngineRumble {
  0% { transform: translate(139px, 92px); }
  100% { transform: translate(141px, 91px); }
}
.rocket-flame-flicker {
  animation: flameFlickerPulse 0.18s ease-in-out infinite alternate;
  transform-box: fill-box;
  transform-origin: center top;
}
@keyframes flameFlickerPulse {
  0% { transform: scaleY(0.85); }
  100% { transform: scaleY(1.25); }
}
.rocket-flame-core {
  animation: flameCoreFlicker 0.15s ease-in-out infinite alternate;
  transform-box: fill-box;
  transform-origin: center top;
}
@keyframes flameCoreFlicker {
  0% { transform: scaleY(0.9); }
  100% { transform: scaleY(1.3); }
}

@media (prefers-reduced-motion: reduce) {
  .cat-modal-card,
  .cat-modal-backdrop,
  .cat-scene-wrapper *,
  .cat-dot-flair .dot,
  .cat-operation-icon {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
  }
  .cat-scene-wrapper { cursor: default; }
}
      `}</style>
    </div>
  );
};
