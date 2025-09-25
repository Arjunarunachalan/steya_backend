import AWS from "aws-sdk";
import dotenv from "dotenv";

dotenv.config();

export const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS,
  secretAccessKey: process.env.AWS_SECRET,
  region: process.env.AWS_REGION,
});

export const BUCKET_NAME = process.env.AWS_BUCKET 
