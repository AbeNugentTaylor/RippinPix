<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Versioning

Bump the patch number in `package.json`'s `"version"` field on every commit pushed to `main`. The site footer renders it live as `v{pkg.version}` (see `PackOpeningApp.tsx`) — after pulling, refresh the page and check that number against what was reported for the push to confirm it actually landed.
