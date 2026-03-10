import type { TabState, XPathEvaluationResult, XPathVariant } from '@shared/types';

export type MessageType =
  | 'picker:start'
  | 'picker:stop'
  | 'picker:result'
  | 'xpath:evaluate'
  | 'xpath:result'
  | 'highlight:preview'
  | 'highlight:clear'
  | 'state:get'
  | 'state:current';

export interface PickerStartMessage {
  type: 'picker:start';
}

export interface PickerStopMessage {
  type: 'picker:stop';
}

export interface PickerResultMessage {
  type: 'picker:result';
  variants: XPathVariant[];
}

export interface XPathEvaluateMessage {
  type: 'xpath:evaluate';
  xpath: string;
}

export interface XPathResultMessage {
  type: 'xpath:result';
  result: XPathEvaluationResult;
}

export interface HighlightPreviewMessage {
  type: 'highlight:preview';
  xpath: string;
}

export interface HighlightClearMessage {
  type: 'highlight:clear';
}

export interface StateGetMessage {
  type: 'state:get';
}

export interface StateCurrentMessage {
  type: 'state:current';
  state: TabState;
}

export type ExtensionMessage =
  | PickerStartMessage
  | PickerStopMessage
  | PickerResultMessage
  | XPathEvaluateMessage
  | XPathResultMessage
  | HighlightPreviewMessage
  | HighlightClearMessage
  | StateGetMessage
  | StateCurrentMessage;
