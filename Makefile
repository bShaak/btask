.PHONY: install test typecheck

install:
	sh scripts/install-agent-integration.sh

test:
	bun test

typecheck:
	bun run typecheck
