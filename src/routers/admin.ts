import { Router } from 'express';
import { pool } from '../config/postgres';
import { checkLogin } from '../middlewares/checkLogin';
import { checkAdmin } from '../middlewares/checkAdmin';
import { uploadS3 } from '../middlewares/upload';
import { generateNotification } from '../modules/generateNotification';
import { PoolClient } from 'pg';
import { ConflictException } from '../exception/ConflictException';
import { BadRequestException } from '../exception/BadRequestException';
import { GameModel } from '../model/GameModel';

const router = Router();

// 게임 생성 요청 승인
router.post(
    '/game',
    checkLogin,
    checkAdmin,
    uploadS3.fields([
        { name: 'thumbnail', maxCount: 1 },
        { name: 'banner', maxCount: 1 },
    ]),
    async (req, res, next) => {
        const { userIdx } = req.decoded;
        const {
            requestIdx,
            title,
            titleKor,
            titleEng,
        }: {
            requestIdx: string;
            title: string;
            titleKor: string;
            titleEng: string;
        } = req.body;
        const { thumbnail, banner } = req.files as { [fieldname: string]: Express.MulterS3.File[] };

        let poolClient: PoolClient | null = null;

        try {
            if (!thumbnail[0] || !banner[0]) throw new BadRequestException('No image');

            poolClient = await pool.connect();

            //요청삭제, 제목,유저idx반환
            const { rows: requestList } = await poolClient.query(
                `
            UPDATE
                request
            SET 
                deleted_at = now(), is_confirmed = true
            WHERE 
                idx = $1
            RETURNING
                user_idx AS "userIdx" , title`,
                [requestIdx]
            );

            //트랜잭션 시작
            await poolClient.query('BEGIN');

            //기존 게임중복확인
            const { rows: existingGameList } = await poolClient.query<GameModel>(
                `
                SELECT
                    *
                FROM
                    game
                WHERE
                    title_eng = $1
                OR
                    title_kor = $2
                AND
                    deleted_at IS NULL`,
                [titleEng, titleKor]
            );

            if (existingGameList.length === 0) throw new ConflictException('Existing game title');

            //새로운게임추가
            const { rows: newGame } = await poolClient.query<{ gameIdx: string }>(
                `
                INSERT INTO
                    game(title, title_kor, title_eng ,user_idx)
                VALUES
                    ( $1, $2, $3, $4 )
                RETURNING
                    idx AS "gameIdx"`,
                [title, titleKor, titleEng, requestList[0].userIdx]
            );

            const newPostTitle = `새로운 게임 "${title}"이 생성되었습니다`;
            const newPostContent = `많은 이용부탁드립니다~`;

            await poolClient.query(
                `
                INSERT INTO
                    post(title, content, user_idx, game_idx)
                VALUES
                    ( $1, $2, $3, $4 )`,
                [newPostTitle, newPostContent, userIdx, newGame[0].gameIdx]
            );

            // 게임 썸네일, 배너이미지 등록
            await poolClient.query(
                `
                INSERT INTO
                    game_img_thumbnail(game_idx, img_path)
                VALUES ( $1, $2 )`,
                [newGame[0].gameIdx, thumbnail[0].location]
            );

            await poolClient.query(
                `
                INSERT INTO
                    game_img_banner(game_idx, img_path)
                VALUES ( $1, $2 )`,
                [newGame[0].gameIdx, banner[0].location]
            );

            await poolClient.query('COMMIT');

            res.status(201).send();
        } catch (e) {
            if (poolClient) await poolClient.query('ROLLBACK');
            next(e);
        } finally {
            if (poolClient) poolClient.release();
        }
    }
);

export = router;
