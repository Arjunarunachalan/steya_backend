import { s3, BUCKET_NAME } from "../config/aws.js";

export const generateSignedUrls = async (files) => {
  const urls = await Promise.all(
    files.map(async (file) => {
      const params = {
        Bucket: BUCKET_NAME,
        Key: `${Date.now()}-${file.name}`, // unique file name
        Expires: 60, // URL valid for 60s
        ContentType: file.type,
      };

      const uploadUrl = await s3.getSignedUrlPromise("putObject", params);
      const finalUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${params.Key}`;

      return {
        fileName: file.name,
        uploadUrl,
        finalUrl,
      };
    })
  );

  return urls;
};
