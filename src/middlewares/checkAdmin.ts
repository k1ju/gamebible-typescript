import { RequestHandler } from 'express';

const jwt = require('jsonwebtoken');
require('dotenv').config();

const checkAdmin: RequestHandler = async (req, res, next) => {
    let { authorization } = req.headers;

    try {
        if (!authorization) {
            const error = new Error('no token');
            error.status = 401;
            throw error;
        }

        //req.headers는 기본적으로 string, undefined
        //authorization 널값체크를 해줬으므로, string확정
        authorization = authorization.split(' ')[1];

        req.decoded = jwt.verify(authorization, process.env.SECRET_KEY);
        const isAdmin = req.decoded.isAdmin;

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
