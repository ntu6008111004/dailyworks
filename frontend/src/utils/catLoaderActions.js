/**
 * Complete catalog and utility engine for the 15 White & Black Cat Loading Actions
 */

export const CAT_ACTIONS = [
  {
    id: 'basketball',
    title: 'ชู้ดบาสสแลมดังก์',
    emoji: '🏀',
    tag: 'กีฬา',
    desc: 'น้องขาวตั้งการ์ด น้องดำเหินฟ้าสแลมดังก์บาสเกตบอลลงห่วง',
  },
  {
    id: 'driving',
    title: 'ขับรถซิ่งเปิดประทุน',
    emoji: '🚗',
    tag: 'ความเร็ว',
    desc: 'ซิ่งรถสปอร์ตเปิดประทุน ล้อหมุนติ้ว ควันลอยพุ่ง โต้ลมสุดเหวี่ยง',
  },
  {
    id: 'swimming',
    title: 'ว่ายน้ำใส่แว่นดำน้ำ',
    emoji: '🏊',
    tag: 'ซัมเมอร์',
    desc: 'น้องขาวใส่สน็อกเกิลดำน้ำ น้องดำลอยบนห่วงยางเป็ดเหลืองตีขา',
  },
  {
    id: 'chasing',
    title: 'วิ่งไล่กวดกันสุดชีวิต',
    emoji: '🏃',
    tag: 'วิ่งเล่น',
    desc: 'น้องขาววิ่งซอยขาตลกๆ หนีน้องดำที่วิ่งไล่กวด ควันพุ่งตามหลัง',
  },
  {
    id: 'slapping',
    title: 'กวนตีนสะกิดตบแปะๆ',
    emoji: '😼',
    tag: 'กวนตีน',
    desc: 'น้องดำทำหน้ากวน ยื่นอุ้งเท้ารัวตบแปะๆ สะกิดหัวน้องขาว',
  },
  {
    id: 'skateboard',
    title: 'ไถสเก็ตบอร์ดยกล้อ',
    emoji: '🛹',
    tag: 'เอ็กซ์ตรีม',
    desc: 'น้องขาวไถสเก็ตบอร์ด น้องดำเกาะท้ายยกล้อพริ้วๆ',
  },
  {
    id: 'weightlifting',
    title: 'ยกดัมเบลล์ปลาทูยักษ์',
    emoji: '🏋️',
    tag: 'ฟิตเนส',
    desc: 'น้องดำเกร็งตัวสั่นยกดัมเบลล์ปลาทู น้องขาวยืนโบกธงเชียร์',
  },
  {
    id: 'fishing',
    title: 'ตกปลาทูดิ้นดุ๊กดิ๊ก',
    emoji: '🎣',
    tag: 'กิจกรรม',
    desc: 'น้องขาวถือเบ็ดตกได้ปลาทูดิ้นกระแด่ว น้องดำถือถังน้ำรอรับ',
  },
  {
    id: 'ufo',
    title: 'จานบิน UFO ดูดแมวลอย',
    emoji: '🛸',
    tag: 'ไซไฟ',
    desc: 'น้องดำขับ UFO ส่องลำแสงสีเขียวดูดน้องขาวลอยเคว้งขึ้นฟ้า',
  },
  {
    id: 'gaming',
    title: 'ดวลเกมกดจอยรัวๆ',
    emoji: '🎮',
    tag: 'เกมเมอร์',
    desc: 'สองแมวนั่งกดจอยเกมรัวๆ แย่งกันคว้าชัยชนะ',
  },
  {
    id: 'ramen',
    title: 'สูดเส้นราเมนชามโต',
    emoji: '🍜',
    tag: 'กินแหลก',
    desc: 'สองแมวดูดเส้นราเมนเข้าปากพร้อมกันจนแก้มตุ่ยดุ๊กดิ๊ก',
  },
  {
    id: 'box',
    title: 'แย่งมุดกล่องกระดาษ',
    emoji: '📦',
    tag: 'ตลก',
    desc: 'เบียดแย่งกันลงไปนอนในกล่องกระดาษใบจิ๋ว ก้นดุ๊กดิ๊ก',
  },
  {
    id: 'roomba',
    title: 'ขี่หุ่นยนต์ดูดฝุ่นหมุนติ้ว',
    emoji: '🧹',
    tag: 'แอดเวนเจอร์',
    desc: 'เกาะบนหุ่นยนต์ดูดฝุ่นออโต้ หมุนติ้วๆ แล่นฉิวไปรอบห้อง',
  },
  {
    id: 'sleeping',
    title: 'นอนกอดกลมป่องฟองสบู่',
    emoji: '💤',
    tag: 'พักผ่อน',
    desc: 'สองแมวนอนกอดกันกลม พุงกระเพื่อมตามลมหายใจ ฟอง Zzz ลอย',
  },
  {
    id: 'rocket',
    title: 'เกาะจรวดทะยานอวกาศ',
    emoji: '🚀',
    tag: 'อวกาศ',
    desc: 'เกาะจรวดจิ๋วพุ่งทะยานฟ้า ไอพ่นเปลวไฟฟู่กระจาย',
  },
];

export const LOADER_OPERATIONS = {
  loading: {
    label: 'กำลังโหลด',
    icon: '↓',
    defaultMessage: 'ข้อมูลจากระบบ',
  },
  saving: {
    label: 'กำลังบันทึก',
    icon: '✓',
    defaultMessage: 'การเปลี่ยนแปลง',
  },
  syncing: {
    label: 'กำลังซิงค์',
    icon: '↻',
    defaultMessage: 'ข้อมูลกับระบบ',
  },
};

const OPERATION_ALIASES = {
  load: 'loading',
  loading: 'loading',
  save: 'saving',
  saving: 'saving',
  sync: 'syncing',
  syncing: 'syncing',
};

/**
 * Removes trailing progress punctuation so the animated dots are rendered once.
 * @param {unknown} message
 * @returns {string}
 */
export const normalizeLoaderMessage = (message) => {
  if (typeof message !== 'string') return '';
  return message.trim().replace(/(?:\s*(?:\.{2,}|…))+\s*$/u, '').trim();
};

/**
 * Resolves an explicit loader operation, or infers it from legacy message text.
 * Sync wins over save for old mixed messages such as "save and sync".
 * @param {unknown} operation
 * @param {unknown} message
 * @returns {'loading'|'saving'|'syncing'}
 */
export const resolveLoaderOperation = (operation = 'auto', message = '') => {
  const explicit = typeof operation === 'string'
    ? OPERATION_ALIASES[operation.trim().toLowerCase()]
    : null;
  if (explicit) return explicit;

  const text = typeof message === 'string' ? message.toLowerCase() : '';
  if (/(?:ซิงค์|ซิงก์|ซิง|sync)/u.test(text)) return 'syncing';
  if (/(?:บันทึก|อัปโหลด|save|upload)/u.test(text)) return 'saving';
  return 'loading';
};

/**
 * Returns the accessible label, visual treatment, and clean detail text.
 * @param {{ operation?: unknown, message?: unknown }} options
 */
export const getLoaderPresentation = ({ operation = 'auto', message = '' } = {}) => {
  const type = resolveLoaderOperation(operation, message);
  const config = LOADER_OPERATIONS[type];
  return {
    type,
    ...config,
    message: normalizeLoaderMessage(message) || config.defaultMessage,
  };
};

/**
 * Returns a random action index from 0 to CAT_ACTIONS.length - 1.
 * If previousIndex is given, it avoids immediately repeating the same index.
 * @param {number|null} [previousIndex=null]
 * @returns {number}
 */
export const getRandomCatActionIndex = (previousIndex = null) => {
  const count = CAT_ACTIONS.length;
  let next = Math.floor(Math.random() * count);
  if (previousIndex !== null && typeof previousIndex === 'number' && next === previousIndex) {
    next = (next + 1) % count;
  }
  return next;
};

/**
 * Returns action metadata safely by index or fallback to the first action.
 * @param {number} index
 * @returns {{ id: string, title: string, emoji: string, tag: string, desc: string }}
 */
export const getCatActionByIndex = (index) => {
  if (typeof index !== 'number' || isNaN(index) || index < 0 || index >= CAT_ACTIONS.length) {
    return CAT_ACTIONS[0];
  }
  return CAT_ACTIONS[index];
};

/**
 * Find an action metadata object by ID.
 * @param {string} id
 * @returns {{ id: string, title: string, emoji: string, tag: string, desc: string } | null}
 */
export const getCatActionById = (id) => {
  if (typeof id !== 'string') return null;
  const found = CAT_ACTIONS.find((action) => action.id === id);
  return found || null;
};

/**
 * Checks if a given action ID is valid.
 * @param {string} id
 * @returns {boolean}
 */
export const isValidCatActionId = (id) => {
  return typeof id === 'string' && CAT_ACTIONS.some((action) => action.id === id);
};

/**
 * Returns the formatted display label for the action badge.
 * @param {number|string} identifier
 * @returns {string}
 */
export const formatCatActionBadge = (identifier) => {
  let action;
  if (typeof identifier === 'number') {
    action = getCatActionByIndex(identifier);
  } else if (typeof identifier === 'string') {
    action = getCatActionById(identifier);
  }
  if (!action) {
    action = CAT_ACTIONS[0];
  }
  return `${action.emoji} ${action.title}`;
};

/**
 * Calculates the next or previous action index for navigation.
 * @param {number} currentIndex
 * @param {number} [step=1]
 * @returns {number}
 */
export const getAdjacentCatActionIndex = (currentIndex, step = 1) => {
  const count = CAT_ACTIONS.length;
  const safeCurrent = typeof currentIndex === 'number' && !isNaN(currentIndex) ? currentIndex : 0;
  return (((safeCurrent + step) % count) + count) % count;
};
