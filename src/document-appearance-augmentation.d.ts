import './types.js';

declare module './types.js' {
  interface DocumentAppearance {
    /** Optional for backward compatibility with documents saved before appearance controls existed. */
    headingTextColor?: string;
    /** Optional for backward compatibility with documents saved before appearance controls existed. */
    primaryTextColor?: string;
    /** Optional for backward compatibility with documents saved before appearance controls existed. */
    secondaryTextColor?: string;
    /** Legacy bounded PDF-safe text sizing. Missing values resolve to normal. */
    textScale?: 'small' | 'normal' | 'large';
    /** Bounded title sizing for the printed commercial document. */
    documentTitleScale?: 'small' | 'normal' | 'large';
    /** Bounded section-heading sizing for the printed commercial document. */
    sectionHeadingScale?: 'small' | 'normal' | 'large';
    /** Bounded body/value sizing for the printed commercial document. */
    bodyTextScale?: 'small' | 'normal' | 'large';
    /** Bounded item-table sizing for the printed commercial document. */
    tableTextScale?: 'small' | 'normal' | 'large';
  }
}
