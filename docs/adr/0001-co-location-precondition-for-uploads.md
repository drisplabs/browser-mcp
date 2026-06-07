# Uploads assume MCP server and browser are co-located

The `upload` tool validates file paths with `fs.stat` on the MCP server's filesystem, but `DOM.setFileInputFiles` requires the file to exist on the **browser host**. For v1 we declare co-location (server and Chrome share a filesystem) as an explicit precondition, so server-side `fs.stat` is a valid proxy for "the browser can see this file."

We considered supporting remote/containerized Chrome with file staging or a transport-level file push, but that is a separate effort. Instead, when Chrome is detected to be remote (e.g. `CEF_BRIDGE_HOST` points at a non-local browser), the `upload` tool fails fast with an error that names path-locality, rather than emitting a silent CDP failure or a misleading "file not found."

## Consequences

- The validator needs a way to determine whether the connected Chrome is local; remote-Chrome uploads are refused, not attempted.
- "Stage files into a shared allowed root on the browser host" is the documented pattern for remote setups.
