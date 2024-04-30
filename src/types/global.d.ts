// 타입만 모아놓는 파일 d.ts
// 글로벌 타입 지정

declare global {
    namespace Express {
        interface Request {
            decoded: { userIdx: string; isAdmin: boolean };
        }
    }
}

declare global {
    interface Error {
        status: number;
    }
}

export {};
