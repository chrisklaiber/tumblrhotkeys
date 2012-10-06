version=1.1

all: zip

zip:
	mkdir -p build
	zip -r "build/tumblrhotkeys_${version}.zip" tumblrhotkeys/

clean:
	rm -rf build
