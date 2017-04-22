
GCS_BUCKET=rd---product-abetts-cfunc

gcloud beta functions deploy compareURLs --stage-bucket $GCS_BUCKET --trigger-http
