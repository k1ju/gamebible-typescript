import * as dotenv from 'dotenv';
import { Request, Response, NextFunction } from 'express';
import express = require('express');
import cors = require('cors');
import { logger } from './middlewares/logger';
// import logApi from './routers/log';
// import accountApi from './routers/account';
// import gameApi from './routers/game';
// import postApi from './routers/post';
// import commentApi from './routers/comment';
// import adminApi from './routers/admin';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: false }));

app.use(logger);
// app.use('/log', logApi);
// app.use('/account', accountApi);
// app.use('/game', gameApi);
// app.use('/post', postApi);
// app.use('/comment', commentApi);
// app.use('/admin', adminApi);

app.use((req: Request, res: Response, next: NextFunction) => {
    next({ status: 404, message: 'API 없음' });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.log(err);
    res.status(err.status || 500).send({
        message: err.status ? err.message : '예상하지 못한 에러가 발생했습니다.',
    });
});
console.log('process.env.HTTP_PORT : ', process.env.HTTP_PORT);
console.log(process.cwd());
console.log('서버실행');

app.listen(process.env.HTTP_PORT, '0.0.0.0', () => {
    console.log(`${process.env.HTTP_PORT}번 포트번호 서버실행`);
});
