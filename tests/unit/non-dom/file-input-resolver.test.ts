/**
 * FileInputResolver unit tests (integration-style with MockCdpClient)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { createMockCdpClient, MockCdpClient } from '../../mocks/cdp-client.mock.js';
import {
  resolveAndUploadFiles,
  resolveFileInputTarget,
  FileInputNotFoundError,
} from '../../../src/non-dom/file-input-resolver.js';

function makeObjectId(id: string): string {
  return `obj-${id}`;
}

function setupMockForFileInput(
  mock: MockCdpClient,
  fileInputObjectId: string,
  fileInputBackendNodeId: number,
  attributes: string[] = []
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

  // DOM.describeNode → backend node id + attributes
  mock.setResponse('DOM.describeNode', {
    node: { backendNodeId: fileInputBackendNodeId, attributes },
  });

  // DOM.setFileInputFiles → void
  mock.setResponse('DOM.setFileInputFiles', {});
}

function compileFindFileInputFunction(declaration: string): (this: ChildNode) => Element | null {
  const createFunction = Function as unknown as (body: string) => () => unknown;
  return createFunction(`return (${declaration});`)() as (this: ChildNode) => Element | null;
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

  it('returns multiple-file metadata from the resolved input', async () => {
    setupMockForFileInput(mock, makeObjectId('input'), 42, ['type', 'file', 'multiple', '']);

    const target = await resolveFileInputTarget(mock, 100);

    expect(target).toEqual({
      backendNodeId: 42,
      objectId: makeObjectId('input'),
      allowsMultiple: true,
    });
  });

  it('finds a label-associated file input when the target resolves to a text node', async () => {
    const dom = new JSDOM(
      `
        <label for="file-input"><span>Choose via Label</span></label>
        <input id="file-input" type="file">
      `,
      { url: 'http://localhost/' }
    );
    const textNode = dom.window.document.querySelector('span')?.firstChild;
    const input = dom.window.document.querySelector('input');
    if (!textNode || !input) {
      throw new Error('Test fixture did not create the expected label input nodes.');
    }

    mock.setResponse('DOM.resolveNode', { object: { objectId: makeObjectId('target') } });
    mock.setResponse('Runtime.callFunctionOn', (params) => {
      const declaration = params?.functionDeclaration as string;
      const fn = compileFindFileInputFunction(declaration);
      expect(fn.call(textNode)).toBe(input);
      return { result: { type: 'object', objectId: makeObjectId('input') } };
    });
    mock.setResponse('DOM.describeNode', {
      node: { backendNodeId: 42, attributes: ['type', 'file'] },
    });

    await expect(resolveFileInputTarget(mock, 100)).resolves.toMatchObject({
      backendNodeId: 42,
      objectId: makeObjectId('input'),
    });
  });

  it('finds a sibling file input when the target resolves to text inside a dropzone', async () => {
    const dom = new JSDOM(
      `
        <div id="drop-zone">
          <input id="dropzone-file-input" type="file">
          <div>Drop files here or click to browse</div>
        </div>
      `,
      { url: 'http://localhost/' }
    );
    const textNode = dom.window.document.querySelector('#drop-zone div')?.firstChild;
    const input = dom.window.document.querySelector('input');
    if (!textNode || !input) {
      throw new Error('Test fixture did not create the expected dropzone input nodes.');
    }

    mock.setResponse('DOM.resolveNode', { object: { objectId: makeObjectId('target') } });
    mock.setResponse('Runtime.callFunctionOn', (params) => {
      const declaration = params?.functionDeclaration as string;
      const fn = compileFindFileInputFunction(declaration);
      expect(fn.call(textNode)).toBe(input);
      return { result: { type: 'object', objectId: makeObjectId('input') } };
    });
    mock.setResponse('DOM.describeNode', {
      node: { backendNodeId: 42, attributes: ['type', 'file'] },
    });

    await expect(resolveFileInputTarget(mock, 100)).resolves.toMatchObject({
      backendNodeId: 42,
      objectId: makeObjectId('input'),
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
