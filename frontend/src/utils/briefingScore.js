const SCORE_PRECISION = 100;

const scoreNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * SCORE_PRECISION) / SCORE_PRECISION : 0;
};

export const BONUS_LEVEL_OPTIONS = [
  { value: 'standard', label: 'มาตรฐาน ×1', multiplier: 1, flatBonus: 0 },
  { value: 'good', label: 'ดี ×1.5', multiplier: 1.5, flatBonus: 0 },
  { value: 'excellent', label: 'ดีมาก ×2', multiplier: 2, flatBonus: 0 },
  { value: 'viral', label: 'ไวรัล +30 คะแนน', multiplier: 1, flatBonus: 30 },
];

export function getBonusLevelDetails(level, basePoints) {
  const selected = BONUS_LEVEL_OPTIONS.find((option) => option.value === level) || BONUS_LEVEL_OPTIONS[0];
  const base = Math.max(0, scoreNumber(basePoints));
  const bonusPoints = selected.flatBonus > 0
    ? selected.flatBonus
    : scoreNumber(base * (selected.multiplier - 1));
  return {
    ...selected,
    basePoints: base,
    bonusPoints,
    totalPoints: scoreNumber(base + bonusPoints),
  };
}

export function formatBriefingPoints(value) {
  return scoreNumber(value).toLocaleString('th-TH', { maximumFractionDigits: 2 });
}

export function getBaseFinalPoints(briefing = {}) {
  const originalPoints = Math.max(0, scoreNumber(briefing.Points));
  const deductedPoints = Math.max(0, scoreNumber(briefing.DeductedPoints));
  const storedFinalPoints = briefing.FinalPoints;
  return storedFinalPoints === null || storedFinalPoints === undefined
    ? Math.max(0, scoreNumber(originalPoints - deductedPoints))
    : Math.max(0, scoreNumber(storedFinalPoints));
}

export function getBriefingAwardedPoints(briefing = {}) {
  const basePoints = getBaseFinalPoints(briefing);
  const bonusPoints = Math.max(0, scoreNumber(briefing.BonusPoints));
  const scoreAdjustment = scoreNumber(briefing.ScoreAdjustment);
  return Math.max(0, scoreNumber(basePoints + bonusPoints + scoreAdjustment));
}

/**
 * True when this person has earned the briefing score. A recipient earns it as
 * soon as their own delivery is completed; the person who briefed the work
 * earns it when the whole briefing is approved.
 */
export function isBriefingEarnedByMember(briefing, { isCreator = false, isAssignee = false, memberStatus = '' } = {}) {
  if (!isCreator && !isAssignee) return false;
  const briefingCompleted = String(briefing?.Status || '') === 'เสร็จสิ้น';
  const ownWorkCompleted = briefingCompleted || String(memberStatus || '') === 'เสร็จสิ้น';
  return (isAssignee && ownWorkCompleted) || (isCreator && briefingCompleted);
}

/**
 * The score is per person, never divided: a 5-point briefing pays the person
 * who briefed it 5 and every recipient 5. Someone who is both is still paid
 * once, and any Task deduction lowers everyone's share by the same amount.
 */
export function getMemberBriefingAward(briefing, roles) {
  return isBriefingEarnedByMember(briefing, roles) ? getBriefingAwardedPoints(briefing) : 0;
}

export function getScoreAdjustmentPreview(briefing, targetPoints) {
  const currentPoints = getBriefingAwardedPoints(briefing);
  const target = Math.max(0, scoreNumber(targetPoints));
  const baseWithBonus = scoreNumber(getBaseFinalPoints(briefing) + Math.max(0, scoreNumber(briefing?.BonusPoints)));
  return {
    currentPoints,
    targetPoints: target,
    delta: scoreNumber(target - currentPoints),
    scoreAdjustment: scoreNumber(target - baseWithBonus),
  };
}
