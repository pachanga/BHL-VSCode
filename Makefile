.PHONY: all build package install clean hooks

all: package

build:
	npm run compile

package: build
	npm run package

install: package
	code --install-extension bhl-*.vsix

clean:
	rm -rf out/ bhl-*.vsix

hooks:
	ln -sf ../../.githooks/post-commit .git/hooks/post-commit
