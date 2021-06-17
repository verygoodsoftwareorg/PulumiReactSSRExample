import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as fs from "fs";
import * as mime from "mime";
import * as path from "path";

interface CoreInfra{
    certificateArn: string,
    examplesZoneId: string
}

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

const coreStack = new pulumi.StackReference("verygoodsoftware/core-infrastructure/dev");

const baseDomain = "examples.verygood.dev";
coreStack.getOutputValue("exampleProps").then((val: CoreInfra) => {

// Create an AWS resource (S3 Bucket)
const contentBucket = new aws.s3.Bucket("static-site-bucket", {
    bucket: baseDomain,
    acl: "public-read",
    website: {
        indexDocument: "index.html",
        errorDocument: "index.html",
    }
});

const webContentsRootPath = path.join(process.cwd(), "../artifacts");

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
    )
});

const distributionArgs: aws.cloudfront.DistributionArgs = {
    enabled: true,
    aliases: [`reactssr.${baseDomain}`],
    origins: [
        {
            originId: contentBucket.arn,
            domainName: contentBucket.websiteEndpoint,
            customOriginConfig: {
                originProtocolPolicy: "http-only",
                httpPort: 80,
                httpsPort: 443,
                originSslProtocols: ["TLSv1.2"],
            },
        },
    ],
    defaultRootObject: "index.html",
    defaultCacheBehavior: {
        targetOriginId: contentBucket.arn,
        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: ["GET", "HEAD", "OPTIONS"],
        cachedMethods: ["GET", "HEAD", "OPTIONS"],
        forwardedValues: {
            cookies: {forward: "none"},
            queryString: false,
        },
        minTtl: 0,
        defaultTtl: 600,
        maxTtl: 600,
    },
    priceClass: "PriceClass_100",
    customErrorResponses: [
        {errorCode: 404, responseCode: 404, responsePagePath: "/404.html"},
    ],
    restrictions: {
        geoRestriction: {
            restrictionType: "none",
        },
    },
    viewerCertificate: {
        acmCertificateArn: val.certificateArn,
        sslSupportMethod: "sni-only",
    },
};

const cdn = new aws.cloudfront.Distribution(
    `reactssr-cdn`,
    distributionArgs
);

new aws.route53.Record(`reactssrDnsRecord`, {
    name: `reactssr`,
    type: "A",
    zoneId: val.examplesZoneId,
    aliases: [
        {
            evaluateTargetHealth: true,
            name: cdn.domainName,
            zoneId: cdn.hostedZoneId,
        },
    ],
});

});

// Export the name of the bucket
// export const bucketName = contentBucket.id
