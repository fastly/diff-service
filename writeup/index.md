# More smarts at the Edge with URL diffs
# Be smarter at the Edge for 90% lower bandwidth bills
# Edge cloud is more than just a CDN. Use it smarter and halve your bandwidth bills
# URL diffs reduce bandwidth bills with smarter Edge logic

Requesting just the difference between two previously cached files, using just a CDN configuration and a serverless cloud compute function is a great example of exploiting edge and serverless compute services to make your website more efficient and performant, and lower your bandwidth costs.

Traditionally, CDNs are only useful for caching your assets closer to your users. But today, modern CDNs like Fastly can be used to perform many activities you may have thought of as something you need to implement in your own application.  Some of these are **products you can sign up for** as add-ons to your CDN service - at Fastly, for example, we offer:

* Image optimisation
* Web application firewall
* Bot detection
* TLS termination
* HTTP2 Server push
* On-the-fly video packaging

At Fastly, we also allow you to run your own configuration code on our edge PoPs, which you can update via UI or API to all our global edge locations in under 5 seconds.  Using this capability, Fastly customers have built some very cool capabilities into their sites.  We've written about many of the things you can do yourself with a few lines of VCL, including managing [authentication of API endpoints](https://www.fastly.com/blog/step-towards-better-web-api-authentication), performing [A/B testing](https://www.fastly.com/blog/ab-testing-edge), [routing microservices](https://www.fastly.com/blog/how-solve-anything-vcl-part-2-soa-routing-and-non-ascii),or collecting and [aggregating analytics data](https://www.fastly.com/blog/beacon-termination-edge).

I was recently downloading packages using the npm package manager, and realised that although I often have a previous version of a package already installed, npm has to download the entire tarball for the new version if installing an update to a module.

Take my open souce service, Polyfill.io.  It is published as an npm module, the latest version of which is 11MB gzipped, and 99MB uncompressed. Using bsdiff, we can produce a patch to summarise the changes from the penultimate version to the latest:

```bash
$ bsdiff polyfill-service-3.16.0.tar polyfill-service-3.17.0.tar polyfill-service-3.16.0...3.17.0.patch
$ ls -lah
total 424
drwxr-xr-x   5 andrewbetts  staff   170B 18 Apr 15:55 .
drwxr-xr-x  14 andrewbetts  staff   476B 18 Apr 16:32 ..
-rw-r--r--   1 andrewbetts  staff   209K 18 Apr 17:27 polyfill-service-3.16.0...3.17.0.patch
-rw-r--r--   1 andrewbetts  staff    99M 18 Apr 15:54 polyfill-service-3.16.0.tar
-rw-r--r--   1 andrewbetts  staff    97M 18 Apr 15:53 polyfill-service-3.17.0.tar
```

So if the client already has 3.16.0, getting to 3.17.0 could be done with a download of only 209KB, a mere 1.8% of the full 11MB (gzipped from 99MB) that you'd otherwise need for the full tarball.

However, module hosting services like npm typically store their modules on a static hosting environment like Amazon S3 or Google Cloud Storage, so there is limited or no ability to add this kind of dynamic content generation feature, and pregenerating a diff between every pair of versions seems unlikely to be a good use of compute or storage resources.

Can this be done at the CDN?

A CDN that allows customer-defined origin services to be selected based on characteristics of the request could be used to route diff-requests to patch-generating service.  In Fastly, we can do this with some simple VCL:

```vcl

backend diff_service {
  .connect_timeout = 1s;
  .dynamic = true;
  .port = "443";
  .host = "binary-diff-generator.herokuapp.com";
  .ssl = true;
  .probe = {
    .request = "GET / HTTP/1.1" "Host: binary-diff-generator.herokuapp.com" "Connection: close" "User-Agent: Fastly healthcheck";
  }
}

sub vcl_recv {

	declare local var.diffUrlPrefix STRING;
	declare local var.diffUrlSuffix STRING;

	if (req.url ~ "^(/downloads/.*)\-(\d+\.\d+\.\d+)...(\d+\.\d+\.\d+)(\.tgz)") {
		set req.backend = diff_service;
		set req.HTTP.Host = "binary-diff-generator.herokuapp.com";
		set var.diffUrlPrefix = if (req.http.Fastly-SSL, "https://", "http://") req.http.Host re.group.1;
		set var.diffUrlSuffix = re.group.4;
		set req.url = "/compareURLs?from=" var.diffUrlPrefix re.group.2 var.diffUrlSuffix "&to=" var.diffUrlPrefix re.group.3 var.diffUrlSuffix;
		return lookup;
	}
}
```

Here I'm imagining that my website has a `/downloads` directory and URLs such as `/downloads/myThing-1.2.3.tgz`, and so I'd like to also support `/downloads/myThing-1.2.3...1.2.4.tgz` as a diff request.  The regular expression match will capture the requests that fall into this category, and then:

1. Changes the backend to point to the service
2. Updates the `Host` header so we are sending the origin's domain in the request to the service
3. Rewrites the path to match the syntax of the diff generator service

