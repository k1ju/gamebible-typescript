import { RequestHandler } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { UnauthorizedException } from '../exception/UnauthorizedException';

export const checkAdmin: RequestHandler = async (req, res, next) => {
    let { authorization } = req.headers;

    try {
        if (!authorization) throw new UnauthorizedException('No token');

        //req.headers는 기본적으로 string, undefined
        const [tokenType, token] = authorization.split(' ')[1];

        if (tokenType !== 'Bearer') throw new Error('Invalid token type');
        if (!token) throw new UnauthorizedException('No token');

        const jwtPayload = jwt.verify<{ userIdx: string; isAdmin: boolean }>(
            token,
            process.env.SECRET_KEY!
        );
        console.log('jwtPayload: ', jwtPayload);

        // if (typeof jwtPayload === 'string') throw new Error('Invalid token');
        // req.decoded = {
        //     userIdx: jwtPayload.userIdx,
        //     isAdmin: jwtPayload.isAdmin,
        // };

        if (typeof req.decoded != 'object' || !('isAdmin' in req.decoded))
            throw new UnauthorizedException('No admin');

        const isAdmin = req.decoded.isAdmin;

        //unauthorizedException 으로 바꾸기
        if (isAdmin != true) throw new UnauthorizedException('No admin');
        next();
    } catch (e) {
        next(e);
    }
};

module.exports = checkAdmin;
