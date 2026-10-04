import './types.js';

declare module './types.js' {
  interface DocumentAppearance {
    /** Optional for backward compatibility with documents saved before appearance controls existed. */
    primaryTextColor?: string;
    /** Optional for backward compatibility with documents saved before appearance controls existed. */
    secondaryTextColor?: string;
    /** Bounded PDF-safe text sizing. Missing legacy values resolve to normal. */
    textScale?: 'small' | 'normal' | 'large';
  }
}
