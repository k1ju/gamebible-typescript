import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

export const checkLogin: RequestHandler = (req, res, next) => {
    // `Authorization` 헤더에서 값을 추출
    const authHeader = req.headers.authorization;

    try {
        if (!authHeader) {
            const error = new Error('no token');
            error.status = 400;
            throw error;
        }

        // `Bearer ` 접두사를 제거하여 실제 토큰 값만 추출
        const token = authHeader.split(' ')[1];

        if (!token) {
            const error = new Error('no token');
            error.status = 400;
            throw error;
        }
        //verify반환값이 string일때와 JwtPayload일때 나눠서 분기처리

        req.decoded = jwt.verify(token, process.env.SECRET_KEY!);
        next();
    } catch (e: Error) {
        //타입스크립트 에러 처리
        //에러 인터페이스 status 속성을 global로 정의해둔다
        if (e instanceof Error) {
            let statusCode = e.status || 500;
            console.log(e.stack);
            res.status(statusCode).send(e.message);
        }
    }
};
