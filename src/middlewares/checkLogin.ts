import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedException } from '../exception/UnauthorizedException';

export const checkLogin: RequestHandler = (req, res, next) => {
    // `Authorization` 헤더에서 값을 추출
    const authHeader = req.headers.authorization;

    try {
        if (!authHeader) throw new UnauthorizedException('no token');

        // `Bearer ` 접두사를 제거하여 실제 토큰 값만 추출
        const token = authHeader.split(' ')[1];

        if (!token) throw new UnauthorizedException('no token');

        //verify반환값이 string일때와 JwtPayload일때 나눠서 분기처리

        const jwtPayload = jwt.verify<{ userIdx: string; isAdmin: boolean }>(
            token,
            process.env.SECRET_KEY!
        );

        req.decoded = {
            userIdx: jwtPayload.userIdx,
            isAdmin: jwtPayload.isAdmin,
        };

        next();
    } catch (err) {
        if (err instanceof Error) {
            // let statusCode = err.status || 500;
            console.log(err.stack);
            // return res.status(statusCode).send(err.message);
        }

        return next(err);
    }
};
