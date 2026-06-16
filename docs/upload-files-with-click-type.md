# Upload Files With Click and Type

## Single File

1. Click the upload control:

```js
click({ eid: '<upload-button-or-input-eid>' });
```

2. Type an absolute file path:

```js
type({
  eid: 'nd-picker-path',
  text: '/absolute/path/to/file.txt',
  clear: true,
});
```

3. Confirm:

```js
click({ eid: 'nd-picker-choose' });
```

## Multiple Files

1. Click the multi-file upload control:

```js
click({ eid: '<multi-file-input-eid>' });
```

2. Type one absolute path per line:

```js
type({
  eid: 'nd-picker-path',
  text: '/absolute/path/a.txt\n/absolute/path/b.txt',
  clear: true,
});
```

3. Confirm:

```js
click({ eid: 'nd-picker-choose' });
```

Paths must be absolute and readable by the browser host.
