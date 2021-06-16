import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as fs from "fs";
import * as mime from "mime";
import * as path from "path";

const crawlDirectory = (dir: string, f: (_: string) => void): void => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = `${dir}/${file}`;
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            crawlDirectory(filePath, f);
        }
        if (stat.isFile()) {
            f(filePath);
        }
    }
};

// Create an AWS resource (S3 Bucket)
const contentBucket = new aws.s3.Bucket("static-site-bucket", {
    bucket: "static-site-bucket",
    acl: "public-read",
    website: {
        indexDocument: "index.html",
        errorDocument: "index.html",
    }
});

const webContentsRootPath = path.join(process.cwd(), "../ui/build/");


crawlDirectory(webContentsRootPath, filePath => {
    const relativeFilePath = filePath.replace(webContentsRootPath + "/", "");

    new aws.s3.BucketObject(
        `static-site-${relativeFilePath}`,
        {
            key: relativeFilePath,
            acl: "public-read",
            bucket: contentBucket,
            contentType: mime.getType(filePath) || undefined,
            source: new pulumi.asset.FileAsset(filePath),
        },
        {
            parent: contentBucket,
        }
    );
});

// Export the name of the bucket
export const bucketName = contentBucket.id;
