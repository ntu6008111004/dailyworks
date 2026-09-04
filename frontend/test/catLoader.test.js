import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAT_ACTIONS,
  LOADER_OPERATIONS,
  getRandomCatActionIndex,
  getCatActionByIndex,
  getCatActionById,
  isValidCatActionId,
  formatCatActionBadge,
  getAdjacentCatActionIndex,
  normalizeLoaderMessage,
  resolveLoaderOperation,
  getLoaderPresentation,
} from '../src/utils/catLoaderActions.js';

describe('catLoaderActions Comprehensive Test Suite', () => {
  it('defines exactly 15 action catalog entries with all required fields', () => {
    assert.equal(CAT_ACTIONS.length, 15);
    const expectedIds = [
      'basketball', 'driving', 'swimming', 'chasing', 'slapping',
      'skateboard', 'weightlifting', 'fishing', 'ufo', 'gaming',
      'ramen', 'box', 'roomba', 'sleeping', 'rocket',
    ];

    expectedIds.forEach((id, index) => {
      const action = CAT_ACTIONS[index];
      assert.equal(action.id, id);
      assert.ok(typeof action.title === 'string' && action.title.length > 0);
      assert.ok(typeof action.emoji === 'string' && action.emoji.length > 0);
      assert.ok(typeof action.tag === 'string' && action.tag.length > 0);
      assert.ok(typeof action.desc === 'string' && action.desc.length > 0);
    });
  });

  describe('getRandomCatActionIndex', () => {
    it('returns a valid index within bounds when called without arguments', () => {
      for (let i = 0; i < 50; i++) {
        const idx = getRandomCatActionIndex();
        assert.ok(idx >= 0 && idx < CAT_ACTIONS.length);
      }
    });

    it('avoids picking previousIndex consecutively when passed a number', () => {
      const prev = 7;
      for (let i = 0; i < 50; i++) {
        const next = getRandomCatActionIndex(prev);
        assert.notEqual(next, prev);
        assert.ok(next >= 0 && next < CAT_ACTIONS.length);
      }
    });

    it('handles non-number previousIndex safely', () => {
      const idxNull = getRandomCatActionIndex(null);
      assert.ok(idxNull >= 0 && idxNull < CAT_ACTIONS.length);
      const idxStr = getRandomCatActionIndex('invalid');
      assert.ok(idxStr >= 0 && idxStr < CAT_ACTIONS.length);
    });
  });

  describe('getCatActionByIndex', () => {
    it('returns the exact action for all valid indices from 0 to 14', () => {
      CAT_ACTIONS.forEach((action, idx) => {
        const retrieved = getCatActionByIndex(idx);
        assert.equal(retrieved.id, action.id);
        assert.equal(retrieved.title, action.title);
      });
    });

    it('falls back to the first action when index is invalid or out of range', () => {
      assert.equal(getCatActionByIndex(-1).id, 'basketball');
      assert.equal(getCatActionByIndex(15).id, 'basketball');
      assert.equal(getCatActionByIndex(999).id, 'basketball');
      assert.equal(getCatActionByIndex(NaN).id, 'basketball');
      assert.equal(getCatActionByIndex('0').id, 'basketball');
      assert.equal(getCatActionByIndex(null).id, 'basketball');
      assert.equal(getCatActionByIndex(undefined).id, 'basketball');
    });
  });

  describe('getCatActionById', () => {
    it('finds existing action metadata by valid id', () => {
      const ufo = getCatActionById('ufo');
      assert.ok(ufo);
      assert.equal(ufo.title, 'จานบิน UFO ดูดแมวลอย');
      assert.equal(ufo.emoji, '🛸');

      const driving = getCatActionById('driving');
      assert.ok(driving);
      assert.equal(driving.id, 'driving');
    });

    it('returns null for non-existent or invalid id types', () => {
      assert.equal(getCatActionById('non_existent'), null);
      assert.equal(getCatActionById(''), null);
      assert.equal(getCatActionById(null), null);
      assert.equal(getCatActionById(undefined), null);
      assert.equal(getCatActionById(123), null);
      assert.equal(getCatActionById({}), null);
    });
  });

  describe('isValidCatActionId', () => {
    it('returns true for every valid action id in CAT_ACTIONS', () => {
      CAT_ACTIONS.forEach((action) => {
        assert.equal(isValidCatActionId(action.id), true);
      });
    });

    it('returns false for invalid IDs and non-string inputs', () => {
      assert.equal(isValidCatActionId('random_cat'), false);
      assert.equal(isValidCatActionId(''), false);
      assert.equal(isValidCatActionId(null), false);
      assert.equal(isValidCatActionId(undefined), false);
      assert.equal(isValidCatActionId(0), false);
      assert.equal(isValidCatActionId([]), false);
    });
  });

  describe('formatCatActionBadge', () => {
    it('formats badge properly given an action index', () => {
      const badge0 = formatCatActionBadge(0);
      assert.equal(badge0, '🏀 ชู้ดบาสสแลมดังก์');

      const badge1 = formatCatActionBadge(1);
      assert.equal(badge1, '🚗 ขับรถซิ่งเปิดประทุน');
    });

    it('formats badge properly given an action id string', () => {
      const badgeUfo = formatCatActionBadge('ufo');
      assert.equal(badgeUfo, '🛸 จานบิน UFO ดูดแมวลอย');
    });

    it('falls back gracefully to the first action if input is invalid', () => {
      assert.equal(formatCatActionBadge('unknown_action'), '🏀 ชู้ดบาสสแลมดังก์');
      assert.equal(formatCatActionBadge(null), '🏀 ชู้ดบาสสแลมดังก์');
      assert.equal(formatCatActionBadge(undefined), '🏀 ชู้ดบาสสแลมดังก์');
      assert.equal(formatCatActionBadge({}), '🏀 ชู้ดบาสสแลมดังก์');
    });
  });

  describe('getAdjacentCatActionIndex', () => {
    it('cycles forward through the 15 actions correctly', () => {
      assert.equal(getAdjacentCatActionIndex(0, 1), 1);
      assert.equal(getAdjacentCatActionIndex(13, 1), 14);
      assert.equal(getAdjacentCatActionIndex(14, 1), 0); // wrap around
    });

    it('cycles backward with negative step correctly', () => {
      assert.equal(getAdjacentCatActionIndex(0, -1), 14); // wrap backward
      assert.equal(getAdjacentCatActionIndex(5, -1), 4);
    });

    it('handles default step and non-number currentIndex safely', () => {
      assert.equal(getAdjacentCatActionIndex(2), 3);
      assert.equal(getAdjacentCatActionIndex(null), 1);
      assert.equal(getAdjacentCatActionIndex(NaN), 1);
      assert.equal(getAdjacentCatActionIndex('string'), 1);
    });
  });

  describe('loader operation presentation', () => {
    it('keeps loading, saving, and syncing as three explicit visual states', () => {
      assert.deepEqual(Object.keys(LOADER_OPERATIONS), ['loading', 'saving', 'syncing']);
      assert.equal(resolveLoaderOperation('loading'), 'loading');
      assert.equal(resolveLoaderOperation('save'), 'saving');
      assert.equal(resolveLoaderOperation('sync'), 'syncing');
      assert.equal(resolveLoaderOperation('unsupported', 'กำลังโหลดข้อมูล'), 'loading');
    });

    it('infers legacy Thai and English messages without changing their callers', () => {
      assert.equal(resolveLoaderOperation('auto', 'กำลังบันทึกข้อมูล'), 'saving');
      assert.equal(resolveLoaderOperation(undefined, 'Uploading images...'), 'saving');
      assert.equal(resolveLoaderOperation(null, 'กำลังซิงก์ข้อมูล'), 'syncing');
      assert.equal(resolveLoaderOperation('auto', 'Syncing saved data'), 'syncing');
      assert.equal(resolveLoaderOperation({}, null), 'loading');
    });

    it('removes only trailing progress dots and supplies a state-specific fallback', () => {
      assert.equal(normalizeLoaderMessage('  กำลังโหลด...  '), 'กำลังโหลด');
      assert.equal(normalizeLoaderMessage('กำลังบันทึก…'), 'กำลังบันทึก');
      assert.equal(normalizeLoaderMessage(null), '');

      assert.deepEqual(getLoaderPresentation({ operation: 'saving', message: 'โปรไฟล์...' }), {
        type: 'saving',
        label: 'กำลังบันทึก',
        icon: '✓',
        defaultMessage: 'การเปลี่ยนแปลง',
        message: 'โปรไฟล์',
      });
      assert.equal(getLoaderPresentation({ operation: 'syncing', message: 42 }).message, 'ข้อมูลกับระบบ');
      assert.equal(getLoaderPresentation().message, 'ข้อมูลจากระบบ');
    });
  });
});

describe('cat loader SVG animation safeguards', () => {
  const source = readFileSync(new URL('../src/components/LoadingModal.jsx', import.meta.url), 'utf8');

  it('keeps rotating wheel spokes grouped around each wheel hub', () => {
    assert.equal((source.match(/<g className="wheel-spin-fast">/g) || []).length, 2);
    assert.doesNotMatch(source, /<line[^>]+className="wheel-spin-fast"/u);
    assert.match(source, /\.wheel-spin-fast\s*\{[^}]*transform-box: fill-box;[^}]*transform-origin: center;/su);
  });

  it('isolates local fish, smoke, dust, ramen, impact, and box transforms', () => {
    assert.match(source, /<g transform="translate\(88, 0\)">\s*<g className="fish-jump-flap">/u);
    assert.match(source, /<g transform="translate\(-12, 48\)">\s*<g className="car-exhaust-puffs">/u);
    assert.match(source, /<g transform="translate\(-25, 30\)">\s*<g className="dust-puff-anim">/u);
    assert.match(source, /<g transform="translate\(80, 114\)">\s*<g className="slurp-cat-left">/u);
    assert.match(source, /<g transform="translate\(150, 118\)">\s*<g className="slap-impact-star">/u);
    assert.match(source, /<g transform="translate\(140, 124\)">\s*<g className="box-squish-wobble">/u);
  });

  it('clips the scene to its SVG and respects reduced-motion preferences', () => {
    assert.match(source, /max-w-full overflow-hidden/);
    assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
  });
});
