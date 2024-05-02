import { Pool, PoolConfig } from 'pg';

// null or undefined가 아님을 명시적으로 표기 = !
// 환경변수로 불러온 값은 null or undefined의 가능성이있기때문
// pg PoolConfig 같은경우 타입까지 라이브러리에서 불러와서 쓴다
const psqlDBconfig: PoolConfig = {
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
