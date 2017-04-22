# Diff service

If you have a website that hosts versioned copies of files such as software packages, documents or save games, which vary only slightly between versions, it makes sense to download only the difference between the version the client already has and the new one that they want.  Using Fastly, we can compute the diff and generate a patch without having to add that feature to your origin server.

Fastly is a CDN, but with our Edge Cloud tools and technologies it's possible to do far more than you might think. This repo is an idea I had to demonstrate how cloud compute tools can be combined with Fastly to do very clever things at the edge.

## Getting started

1. Install prerequisites: [VCL CLI](https://github.com/stephenbasile/vcl_cli) by Stephen Basile, which allows updating of configuration of Fastly accounts, and [Google Cloud Platform SDK](https://cloud.google.com/functions/docs/quickstart), to push cloud functions to Google's platform.
2. Create a Cloud Storage bucket on Google Cloud Platform and put the name of it into the `deploy.sh` file
3. Deploy the cloud function with `npm run deploy` and note the HTTPS URL of the deployed function
4. Create a Fastly service with two origin servers:
	* **File server** hosting your static, versioned files
	* **Diff service** using the URL that you got from deploying the cloud function
5. Update `fastly-service.vcl` with the hostname of your Cloud function
6. Upload the VCL to your Fastly service

## Testing locally

If you don't want to deploy the function to GCF to test it, you can also run a local server that makes it accessible on your machine

## Rebuilding bsdiff

A precompiled binary of `bsdiff` is included in this repo, but if it does not work on your machine you can also install it using homebrew or [download the source](http://www.daemonology.net/bsdiff/) (at time of writing the package has a number of problems, which are documented with fixes [here](http://www.cnblogs.com/lping/p/5833090.html) - albeit in Chinese)
