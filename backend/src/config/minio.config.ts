import * as Minio from 'minio';
import dotenv from 'dotenv';
dotenv.config();

// Initialize Minio variables from environment variables

const minioEndpoint = process.env.MINIO_ENDPOINT?.trim();
if (!minioEndpoint) {
    throw new Error('MINIO_ENDPOINT is not defined in the environment variables.');
}

const minioPort = process.env.MINIO_PORT?.trim();
if (!minioPort) {
    throw new Error('MINIO_PORT is not defined in the environment variables.');
}

const minioAccessKey = process.env.MINIO_ACCESS_KEY?.trim();
if (!minioAccessKey) {
    throw new Error('MINIO_ACCESS_KEY is not defined in the environment variables.');
}

const minioSecretKey = process.env.MINIO_SECRET_KEY?.trim();
if (!minioSecretKey) {
    throw new Error('MINIO_SECRET_KEY is not defined in the environment variables.');
}

export const minioClient = new Minio.Client({
    endPoint: minioEndpoint,
    port: parseInt(minioPort),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: minioAccessKey,
    secretKey: minioSecretKey,
});

export const BUCKET_NAME = process.env.MINIO_BUCKET_NAME?.trim();

if (!BUCKET_NAME) {
    throw new Error('MINIO_BUCKET_NAME is not defined in the environment variables.');
}

export const initializeMinio = async () => {
    try {
        console.log("Minio connected successfully.");
        const exists = await minioClient.bucketExists(BUCKET_NAME);
        if (!exists) {
            await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
            console.log(`Bucket ${BUCKET_NAME} created successfully.`);
        }
    } catch (error) {
        console.error('Error initializing Minio:', error);
    }
};
