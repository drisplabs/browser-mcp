/**
 * FileInputResolver unit tests (integration-style with MockCdpClient)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockCdpClient, MockCdpClient } from '../../mocks/cdp-client.mock.js';
import {
  resolveAndUploadFiles,
  FileInputNotFoundError,
} from '../../../src/non-dom/file-input-resolver.js';

function makeObjectId(id: string): string {
  return `obj-${id}`;
}

function setupMockForFileInput(
  mock: MockCdpClient,
  fileInputObjectId: string,
  fileInputBackendNodeId: number
): void {
  // DOM.resolveNode → object with objectId
  mock.setResponse('DOM.resolveNode', { object: { objectId: makeObjectId('target') } });

  // Runtime.callFunctionOn (find file input) → returns file input object
  mock.setResponse('Runtime.callFunctionOn', (params) => {
    const p = params!;
    if (
      typeof p.functionDeclaration === 'string' &&
      p.functionDeclaration.includes('input[type="file"]')
    ) {
      // First call: find the input
      return { result: { type: 'object', objectId: fileInputObjectId } };
    }
    // Second call: dispatch events
    return { result: { type: 'undefined' } };
  });

  // DOM.describeNode → backend node id
  mock.setResponse('DOM.describeNode', { node: { backendNodeId: fileInputBackendNodeId } });

  // DOM.setFileInputFiles → void
  mock.setResponse('DOM.setFileInputFiles', {});
}

describe('resolveAndUploadFiles', () => {
  let mock: MockCdpClient;

  beforeEach(() => {
    mock = createMockCdpClient();
  });

  it('resolves direct file input and calls setFileInputFiles with correct args', async () => {
    const fileInputBackendNodeId = 42;
    setupMockForFileInput(mock, makeObjectId('input'), fileInputBackendNodeId);

    await resolveAndUploadFiles(mock, 100, ['/tmp/file.txt']);

    // Verify setFileInputFiles was called with the resolved backend node id
    expect(mock.sendSpy).toHaveBeenCalledWith('DOM.setFileInputFiles', {
      backendNodeId: fileInputBackendNodeId,
      files: ['/tmp/file.txt'],
    });
  });

  it('dispatches input and change events after setting files', async () => {
    setupMockForFileInput(mock, makeObjectId('input'), 42);

    await resolveAndUploadFiles(mock, 100, ['/tmp/file.txt']);

    const calls = mock.sendSpy.mock.calls as [string, unknown][];
    const callFunctionCalls = calls.filter(([method]) => method === 'Runtime.callFunctionOn');
    // There should be two callFunctionOn calls: one to find the input, one to dispatch events
    expect(callFunctionCalls.length).toBeGreaterThanOrEqual(2);

    const lastCallFn = callFunctionCalls[callFunctionCalls.length - 1]?.[1] as Record<
      string,
      unknown
    >;
    expect(lastCallFn?.functionDeclaration).toContain('dispatchEvent');
  });

  it('throws FileInputNotFoundError when DOM.resolveNode returns no objectId', async () => {
    mock.setResponse('DOM.resolveNode', { object: { objectId: undefined } });

    await expect(resolveAndUploadFiles(mock, 100, ['/tmp/file.txt'])).rejects.toThrow(
      FileInputNotFoundError
    );
  });

  it('throws FileInputNotFoundError when no file input found in element tree', async () => {
    mock.setResponse('DOM.resolveNode', { object: { objectId: makeObjectId('target') } });
    // callFunctionOn returns null (no file input found)
    mock.setResponse('Runtime.callFunctionOn', {
      result: { type: 'object', subtype: 'null', objectId: undefined },
    });

    await expect(resolveAndUploadFiles(mock, 100, ['/tmp/file.txt'])).rejects.toThrow(
      FileInputNotFoundError
    );
  });

  it('passes multiple files to setFileInputFiles', async () => {
    setupMockForFileInput(mock, makeObjectId('input'), 42);

    await resolveAndUploadFiles(mock, 100, ['/tmp/a.txt', '/tmp/b.txt']);

    expect(mock.sendSpy).toHaveBeenCalledWith('DOM.setFileInputFiles', {
      backendNodeId: 42,
      files: ['/tmp/a.txt', '/tmp/b.txt'],
    });
  });
});
