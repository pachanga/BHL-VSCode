VERSION := $(shell node -p "require('./package.json').version")

.PHONY: all build package install clean hooks

all: package

build:
	npm run compile

package: build
	rm -f bhl-*.vsix
	npm run package

install: package
	code --install-extension bhl-$(VERSION).vsix

clean:
	rm -rf out/ bhl-*.vsix

hooks:
	ln -sf ../../.githooks/post-commit .git/hooks/post-commit
