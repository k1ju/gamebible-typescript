// 타입만 모아놓는 파일 d.ts
// 글로벌 타입 지정

declare global {
    namespace Express {
        interface Request {
            decoded: { userIdx: string };
        }
    }
}

export {};
