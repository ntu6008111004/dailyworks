const wholeNumber = (value) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;

export function getBaseFinalPoints(briefing = {}) {
  const originalPoints = Math.max(0, wholeNumber(briefing.Points));
  const deductedPoints = Math.max(0, wholeNumber(briefing.DeductedPoints));
  const storedFinalPoints = briefing.FinalPoints;
  return storedFinalPoints === null || storedFinalPoints === undefined
    ? Math.max(0, originalPoints - deductedPoints)
    : Math.max(0, wholeNumber(storedFinalPoints));
}

export function getBriefingAwardedPoints(briefing = {}) {
  const basePoints = getBaseFinalPoints(briefing);
  const bonusPoints = Math.max(0, wholeNumber(briefing.BonusPoints));
  const scoreAdjustment = wholeNumber(briefing.ScoreAdjustment);
  return Math.max(0, basePoints + bonusPoints + scoreAdjustment);
}

export function getScoreAdjustmentPreview(briefing, targetPoints) {
  const currentPoints = getBriefingAwardedPoints(briefing);
  const target = Math.max(0, wholeNumber(targetPoints));
  const baseWithBonus = getBaseFinalPoints(briefing) + Math.max(0, wholeNumber(briefing?.BonusPoints));
  return {
    currentPoints,
    targetPoints: target,
    delta: target - currentPoints,
    scoreAdjustment: target - baseWithBonus,
  };
}
