# Handle Permission Requests With Click

This test used normal page actions only. No permission-specific tool was used.

## Flow Used

1. Click the permission request button:

```js
click({ eid: '<request-permission-button-eid>' });
```

2. Wait briefly, then reacquire page state:

```js
snapshot();
```

3. Verify the page status text:

```js
find({ label: 'Granted' });
find({ label: 'Permission:' });
```

## Geolocation Example

```js
click({ eid: '<request-geolocation-button-eid>' });
snapshot();
find({ label: 'Granted' });
```

Expected result:

```text
✓ Granted — lat ..., lon ...
```

## Notifications Example

```js
click({ eid: '<request-notifications-button-eid>' });
snapshot();
find({ label: 'Permission:' });
```

Expected result:

```text
✓ Permission: granted
```

## Caveat

In this browser session, permission prompts did not expose synthetic controls like `nd-permission-allow` or `nd-permission-deny`. The requests resolved automatically as granted, so the usable pattern was click, wait, snapshot, and verify page-visible status.
