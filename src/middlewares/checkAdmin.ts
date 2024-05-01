import { RequestHandler } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

export const checkAdmin: RequestHandler = async (req, res, next) => {
    let { authorization } = req.headers;

    try {
        if (!authorization) {
            const error = new Error('no token');
            error.status = 401;
            throw error;
        }

        //req.headers는 기본적으로 string, undefined
        //authorization 널값체크를 해줬으므로, string확정
        const [tokenType, token] = authorization.split(' ')[1];

        //unauthorizedException 으로 바꾸기
        if (tokenType !== 'Bearer') throw new Error('Invalid token type');
        //unauthorizedException 으로 바꾸기
        if (!token) throw new Error('no token');

        //req.decoded 는 string | jwt.JwtPayload
        //req.decoded는 반드시 isAdmin을 갖고있어야함

        const jwtPayload: string | JwtPayload = jwt.verify(token, process.env.SECRET_KEY!);

        if (typeof jwtPayload === 'string') throw new Error('invalid token');
        req.decoded = {
            userIdx: jwtPayload.userIdx,
            isAdmin: jwtPayload.isAdmin,
        };

        //req.decoded가 object가 아니거나, isAdmin이 없다면
        if (typeof req.decoded != 'object' || !('isAdmin' in req.decoded))
            throw new Error('no Admin');

        const isAdmin = req.decoded.isAdmin;

        //unauthorizedException 으로 바꾸기
        if (isAdmin != true) {
            const error = new Error('no admin');
            error.status = 401;
            throw error;
        }
        next();
    } catch (e) {
        next(e);
    }
};

module.exports = checkAdmin;
