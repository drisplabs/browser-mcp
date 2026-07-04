# Dockerfile for Glama (https://glama.ai/mcp/servers) build/inspection.
#
# Agent Web Interface is a stdio MCP server. Tools register at startup and Chrome
# is launched lazily on the first tool call (see src/browser/ensure-browser.ts),
# so `tools/list` introspection succeeds with no browser present — which is all
# Glama's check requires.
#
# This image is intentionally minimal: it is for Glama's introspection check, not
# for driving a real browser inside the container. Normal usage is local via
# `npx agent-web-interface`, where the server connects to or launches the user's
# Chrome. To run browser tools inside a container, install google-chrome-stable
# and set AWI_BROWSER_MODE=isolated and AWI_HEADLESS=true.
FROM node:20-slim

RUN npm install -g agent-web-interface@latest

ENTRYPOINT ["agent-web-interface"]
