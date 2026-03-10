export type Strategy = 'id' | 'data-attr' | 'attribute' | 'text' | 'class' | 'optimized' | 'absolute';

export interface XPathVariant {
  xpath: string;
  strategy: Strategy;
  matchCount: number;
  label: string;
}

export interface XPathEvaluationResult {
  nodes: string[];
  count: number;
  error: string | null;
  truncated: boolean;
}

export interface TabState {
  pickerActive: boolean;
  lastInput: string;
  lastVariants: XPathVariant[];
}

export type HighlightChannel = 'picker' | 'matches' | 'preview';
