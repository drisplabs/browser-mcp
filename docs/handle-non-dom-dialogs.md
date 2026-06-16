# Handle Non-DOM Dialogs

JavaScript dialogs block normal DOM interaction. When one is open, the page state exposes synthetic `nd-dialog-*` controls. Use normal `click` and `type` calls against those controls.

## Alert

```js
click({ eid: '<trigger-alert-button-eid>' });
click({ eid: 'nd-dialog-ok' });
```

## Confirm

Accept:

```js
click({ eid: '<trigger-confirm-button-eid>' });
click({ eid: 'nd-dialog-ok' });
```

Dismiss:

```js
click({ eid: '<trigger-confirm-button-eid>' });
click({ eid: 'nd-dialog-dismiss' });
```

## Prompt

Submit text:

```js
click({ eid: '<trigger-prompt-button-eid>' });
type({
  eid: 'nd-dialog-input',
  text: 'response text',
  clear: true,
});
click({ eid: 'nd-dialog-ok' });
```

Cancel:

```js
click({ eid: '<trigger-prompt-button-eid>' });
click({ eid: 'nd-dialog-dismiss' });
```

Reacquire page state after the dialog closes before reusing DOM element IDs.
