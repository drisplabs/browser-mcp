# Dockerfile for Glama (https://glama.ai/mcp/servers) build/inspection.
#
# Drisp Browser is a stdio MCP server. Tools register at startup and Chrome
# is launched lazily on the first tool call (see src/browser/ensure-browser.ts),
# so `tools/list` introspection succeeds with no browser present — which is all
# Glama's check requires.
#
# This image is intentionally minimal: it is for Glama's introspection check, not
# for driving a real browser inside the container. Normal usage is local via
# `npx @drisp/browser-mcp`, where the server connects to or launches the user's
# Chrome. To run browser tools inside a container, install google-chrome-stable
# and set DRISP_BROWSER_MODE=isolated and DRISP_BROWSER_HEADLESS=true.
FROM node:20-slim

RUN npm install -g @drisp/browser-mcp@latest

ENTRYPOINT ["drisp-browser-mcp"]
