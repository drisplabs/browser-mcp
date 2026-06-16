export {
  getSurface,
  setSurface,
  clearSurface,
  updateInputValue,
  buildDialogSurface,
  buildFilePickerSurface,
  buildFilePickerSurfaceForInput,
  buildPermissionSurface,
  isNonDomEid,
  getSurfaceControl,
} from './surface-store.js';
export type {
  NonDomControl,
  NonDomSurface,
  NonDomControlKind,
  NonDomSurfaceKind,
  FileChooserState as SurfaceFileChooserState,
} from './surface-store.js';

export { renderNonDomSurface, renderNonDomControlDetails } from './surface-xml.js';

export { validateFilePaths, FileValidationError } from './file-path-validator.js';
export type { ValidatedPaths, FileValidationErrorCode } from './file-path-validator.js';

export { resolveAndUploadFiles, FileInputNotFoundError } from './file-input-resolver.js';

export { DialogManager, getOrCreateDialogManager, removeDialogManager } from './dialog-manager.js';
export type { PendingDialog, FileChooserState, DialogType } from './dialog-manager.js';

export {
  DownloadManager,
  getOrCreateDownloadManager,
  removeDownloadManager,
} from './download-manager.js';
export type { DownloadEntry, DownloadStatus } from './download-manager.js';

export { setPermissions } from './permission-manager.js';
export type { BrowserPermission } from './permission-manager.js';

export {
  PermissionDetector,
  getOrCreatePermissionDetector,
  removePermissionDetector,
  buildPermissionDetectorScript,
  PERMISSION_BINDING_NAME,
} from './permission-detector.js';
export type { PendingPermission } from './permission-detector.js';
