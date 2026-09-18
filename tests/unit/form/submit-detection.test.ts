/**
 * Submit Detection Tests
 *
 * Covers isSubmitButton's two signals: the label keyword list, and the
 * type="submit" attribute.
 */

import { describe, it, expect } from 'vitest';
import { isSubmitButton } from '../../../src/form/submit-detection.js';
import type { ReadableNode } from '../../../src/snapshot/snapshot.types.js';

function createButton(label: string, inputType?: string): ReadableNode {
  return {
    eid: 'e1',
    kind: 'button',
    label,
    ...(inputType ? { attributes: { input_type: inputType } } : {}),
  } as unknown as ReadableNode;
}

describe('isSubmitButton', () => {
  it('detects a submit button from a keyword in its label', () => {
    expect(isSubmitButton(createButton('Save changes'))).toBe(true);
  });

  it('does not detect a plain button with no submit keyword', () => {
    expect(isSubmitButton(createButton('Go'))).toBe(false);
  });

  // Regression (#105): <input type="submit"> is role="button" in Chrome's AX
  // tree, so before input_type was extracted for the button kind this branch
  // was unreachable and a submit input with a non-keyword value (e.g. "Go")
  // went undetected. Widening the extractor revived it — keep it that way.
  it('detects a submit input by its type even when the label has no keyword', () => {
    expect(isSubmitButton(createButton('Go', 'submit'))).toBe(true);
  });

  it('does not treat a non-submit input type as a submit button', () => {
    expect(isSubmitButton(createButton('Go', 'file'))).toBe(false);
  });
});
