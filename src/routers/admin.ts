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
import { RequestModel } from '../model/RequestModel';
import { NoContentException } from '../exception/NoContentException';

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

//승인요청온 게임목록보기
router.get('/game/request/all', checkLogin, checkAdmin, async (req, res, next) => {
    const lastIdx = (req.query.lastidx as string) || '99999999';
    try {
        let requestList: RequestModel[];

        if (!lastIdx) {
            // 최신 관리자알람 20개 출력
            ({ rows: requestList } = await pool.query<RequestModel>(`
                SELECT
                    idx, user_idx AS "userIdx", title, created_at AS "createdAt" 
                FROM
                    request
                WHERE 
                    deleted_at IS NULL
                ORDER BY
                    idx DESC
                LIMIT
                    20`));
        } else {
            // lastIdx보다 작은 관리자알람 20개 출력
            ({ rows: requestList } = await pool.query<RequestModel>(
                `
                SELECT
                    idx, user_idx AS "userIdx", title, created_at AS "createdAt"
                FROM
                    request
                WHERE 
                    deleted_at IS NULL
                AND
                    idx < $1
                ORDER BY
                    idx DESC
                LIMIT
                    20`,
                [lastIdx]
            ));
        }

        //요청없는 경우
        if (!requestList.length) throw new NoContentException('No request');

        res.status(200).send({
            data: {
                lastIdx: requestList[requestList.length - 1].idx,
                requestList: requestList,
            },
        });
    } catch (e) {
        next(e);
    }
});

//승인요청 거부
router.delete('/game/request/:requestidx', checkLogin, checkAdmin, async (req, res, next) => {
    const requestIdx: string = req.params.requestidx;
    let poolClient: PoolClient | null = null;

    try {
        poolClient = await pool.connect();
        await poolClient.query(`BEGIN`);
        // 요청삭제
        await poolClient.query(
            `UPDATE
                request
            SET 
                deleted_at = now(), is_confirmed = false
            WHERE 
                idx = $1`,
            [requestIdx]
        );

        // 해당요청
        const { rows: requestList } = await poolClient.query<RequestModel>(
            `SELECT
                idx, user_idx AS "userIdx", title, created_at AS "createdAt"
            FROM 
                request
            WHERE 
                idx = $1`,
            [requestIdx]
        );

        // 추출한 user_idx, 게임제목으로 새로운 게임 생성, 삭제 -> 그래야 거절 알림보낼 수 있음
        await poolClient.query(
            `INSERT INTO
                game(user_idx, title, deleted_at)
            VALUES
                ( $1, $2, now())`,
            [requestList[0].userIdx, requestList[0].title]
        );
        // 방금 생성,삭제된 게임idx 추출
        const { rows: deletedGameList } = await poolClient.query<GameModel>(
            `SELECT
                idx, user_idx as "userIdx", title, title_eng AS "titleEng", title_kor AS "titleKor", created_at AS "createdAt", deleted_at AS "deletedAt"  
            FROM
                game
            ORDER BY
                idx DESC
            LIMIT
                1`
        );

        //알림생성
        await generateNotification({
            conn: poolClient,
            type: 'DENY_GAME',
            gameIdx: deletedGameList[0].idx,
            toUserIdx: requestList[0].userIdx,
        });

        await poolClient.query(`COMMIT`);

        res.status(200).send();
    } catch (e) {
        if (poolClient) await poolClient.query(`ROLLBACK`);
        next(e);
    } finally {
        if (poolClient) poolClient.release();
    }
});

export = router;
