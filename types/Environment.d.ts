declare global {
    namespace NodeJS {
        interface ProcessEnv {
            HTTP_PORT: number;

            PSQL_HOST: string | undefined;
            PSQL_USER: string | undefined;
            PSQL_PW: string | undefined;
            PSQL_DATABASE: string | undefined;
            PSQL_PORT: string | undefined;
        }
    }
}

export {};
