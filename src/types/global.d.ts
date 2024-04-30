// 타입만 모아놓는 파일 d.ts
// 글로벌 타입 지정

import { JwtPayload } from 'jsonwebtoken';

declare global {
    // namespace jwt {
    interface JwtPayload {
        userIdx: string;
        isAdmin: boolean;
    }
    // }
}

declare global {
    namespace Express {
        interface Request {
            decoded: JwtPayload;
        }
    }
}

declare global {
    interface Error {
        status: number;
    }
}

export {};
