declare global {
    namespace NodeJS {
        interface ProcessEnv {
            HTTP_PORT: number;

            PSQL_HOST: string | undefined;
            PSQL_USER: string | undefined;
            PSQL_PW: string | undefined;
            PSQL_DATABASE: string | undefined;
            PSQL_PORT: string | undefined;

            SECRET_KEY: string;
            S3_ACCESS_KEY_ID: string;
            S3_SECRET_ACCESS_KEY: string;
            S3_BUCKET_NAME: string;
        }
    }
}

export {};
