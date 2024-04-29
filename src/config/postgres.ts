import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import { Pool } from 'pg';

//인터페이스명은 대문자로 짓는다
interface PsqlDBconfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    idleTimeoutMillis: number;
    connectionTimeoutMillis: number;
}

// null or undefined가 아님을 명시적으로 표기 = !
// 환경변수로 불러온 값은 null or undefined의 가능성이있기때문
const psqlDBconfig: PsqlDBconfig = {
    host: process.env.PSQL_HOST!,
    port: parseInt(process.env.PSQL_PORT!),
    database: process.env.PSQL_DATABASE!,
    user: process.env.PSQL_USER!,
    password: process.env.PSQL_PW!,
    idleTimeoutMillis: 10 * 1000,
    connectionTimeoutMillis: 15 * 1000,
};

const pool = new Pool(psqlDBconfig);

export { pool };
