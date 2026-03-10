export const MAX_RESULTS = 1000;
export const MAX_VARIANTS = 8;
export const MAX_PER_STRATEGY = 2;
export const DEBOUNCE_MS = 150;
export const COPY_FLASH_MS = 1500;
export const TEXT_MAX_LENGTH = 80;
export const CLASS_MIN_LENGTH = 3;
export const HEX_HASH_MIN_LENGTH = 6;

export const DATA_ATTR_PRIORITY = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'data-automation'] as const;

export const ALLOWED_ATTRIBUTES = [
  'name',
  'placeholder',
  'aria-label',
  'title',
  'role',
  'type',
  'alt',
  'href',
] as const;

export const FORBIDDEN_ATTR_PREFIXES = ['_ngcontent', 'data-v-', 'x-ref'] as const;

export const REJECTED_CLASS_PREFIXES = ['css-', 'jsx-', 'sc-'] as const;

export const REJECTED_UTILITY_CLASSES = new Set([
  'flex',
  'grid',
  'block',
  'inline',
  'hidden',
  'relative',
  'absolute',
  'static',
  'fixed',
  'sticky',
]);
