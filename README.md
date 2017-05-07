# Diff service

If you have a website that hosts versioned copies of files such as software packages, documents or save games, which vary only slightly between versions, it makes sense to download only the difference between the version the client already has and the new one that they want.  Using Fastly, we can compute the diff and generate a patch without having to add that feature to your origin server.

Fastly is a CDN, but with our Edge Cloud tools and technologies it's possible to do far more than you might think. This repo is an idea I had to demonstrate how cloud compute tools can be combined with Fastly to do very clever things at the edge.

## Getting started

1. Install prerequisites:
	- [Google Cloud Platform SDK](https://cloud.google.com/functions/docs/quickstart), to push cloud functions to Google's platform.
1. Create a Cloud Storage bucket on Google Cloud Platform and put the name of it into the `deploy.sh` file
1. Deploy the cloud function with `npm run deploy` and note the HTTPS URL of the deployed function
1. Create a Fastly service with two origin servers:
	* **File server** hosting your static, versioned files
	* **Diff service** using the URL that you got from deploying the cloud function
1. Update `fastly-service.vcl` with the hostname of your Cloud function
1. Upload the VCL to your Fastly service

## Testing locally

If you don't want to deploy the function to GCF to test it, you can also run a local server that makes it accessible on your machine with `npm start`

## Rebuilding bsdiff

1. Install [Docker](https://store.docker.com/editions/community/docker-ce-desktop-mac?tab=description), to run the Google cloud platform docker instance
1. Copy the contents of the [Google Cloud platform dockerfile](https://github.com/GoogleCloudPlatform/nodejs-docker/blob/master/base/Dockerfile) to an empty folder
1. Build the container with `docker build .`
1. Find the container ID with `docker images`
1. Run the container with `docker run -v $(pwd):/hostos -it 97bea97cfbbd /bin/bash` (replace the ID with the one from the `docker images` output)
1. Inside the container:
	1. Use the home directory: `cd /home`
	1. Download bsdiff: `curl http://www.daemonology.net/bsdiff/bsdiff-4.3.tar.gz -o bsdiff.tgz`
	1. Unpack: `tar zxvf bsdiff.tgz`
	1. Install an editor: `apt-get update; apt-get install nano` (or whatever editor you want to use for the next step)
	1. Apply [these changes](http://www.cnblogs.com/lping/p/5833090.html) to the downloaded files:
		1. Insert a tab at the start of lines 13 and 15 of Makefile
		1. Add the line `#include <sys/types.h>` at the top of `bspatch.c`
	1. Install required library: `apt-get install libbz2-dev`
	1. Make! `make`
	1. Copy the resulting binaries to your host OS: `cp bsdiff bspatch /hostos/`
	1. Quit: `exit`
