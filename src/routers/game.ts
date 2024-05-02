import { Router } from 'express';
import { pool } from '../config/postgres';
import { query, body } from 'express-validator';
import { handleValidationErrors } from '../middlewares/validator';
import { checkLogin } from '../middlewares/checkLogin';
import { generateNotifications } from '../modules/generateNotification';
import { uploadS3 } from '../middlewares/upload';
import { GameModel } from '../model/GameModel';
import { BadRequestException } from '../exception/BadRequestException';
import { ConflictException } from '../exception/ConflictException';
import { NoContentException } from '../exception/NoContentException';
import { PoolClient } from 'pg';

const router = Router();

//게임생성요청
router.post(
    '/request',
    checkLogin,
    body('title').isString().trim().isLength({ min: 2 }).withMessage('2글자이상입력해주세요'), // 미들웨어 타입체크
    handleValidationErrors,
    async (req, res, next) => {
        const title: string = req.body.title;

        //미들웨어에서 타입체킹 안되면 컨트롤러에서한다
        // if (typeof title !== 'string') {
        //     throw new Error('error');
        // }

        const userIdx: string = req.decoded!.userIdx;

        // 컨트롤러의 책임
        // 받아오는 값의 타입이 any가 되면 안 됨

        // query가 자동한 결과에 대한 타입이 명시가 되어있어야함
        // generic
        try {
            const selectGameSQLResult = await pool.query<GameModel>(
                `
                SELECT
                    *
                FROM
                    game
                WHERE
                    title = $1
                AND
                    deleted_at IS NULL`,
                [title]
            );
            const existingGame = selectGameSQLResult.rows[0];

            if (existingGame) throw new ConflictException('That game already exist');

            const sql = `
                INSERT INTO 
                    request(user_idx, title) 
                VALUES 
                    ( $1 ,$2 )`;
            const values = [userIdx, title];
            await pool.query(sql, values);

            res.status(200).send();
        } catch (e) {
            next(e);
        }
    }
);

//게임목록불러오기
router.get('/all', async (req, res, next) => {
    let page: number = Number(req.query.page) || 1;

    //20개씩 불러오기
    const skip = (page - 1) * 20;

    try {
        const gameSelectSQLResult = await pool.query<GameModel>(
            `SELECT 
                *
            FROM 
                game
            WHERE 
                deleted_at IS NULL 
            ORDER BY 
                title ASC
            LIMIT 
                20
            OFFSET
                $1`,
            [skip]
        );

        const gameList = gameSelectSQLResult.rows;

        if (!gameList.length) return res.status(204).send();

        const totalGamesNumberSQLResult = await pool.query<TotalGamesNumber>(`
            SELECT
                count(*)
            FROM
                game
            WHERE
                deleted_at IS NULL`);

        const totalGamesNumber: number = totalGamesNumberSQLResult.rows[0].count;
        const maxPage = Math.ceil(totalGamesNumber / 20);

        res.status(200).send({
            data: {
                maxPage: maxPage,
                page: page,
                skip: skip,
                count: gameList.length,
                gameList: gameList.map((game) => ({
                    idx: game.idx,
                    userIdx: game.user_idx,
                    title: game.title,
                    createdAt: game.created_at,
                })),
            },
        });
    } catch (e) {
        next(e);
    }
});

//게임검색하기
router.get(
    '/search',
    query('title').isString().trim().isLength({ min: 2 }).withMessage('2글자 이상입력해주세요'),
    handleValidationErrors,
    async (req, res, next) => {
        const title: string = req.query.title as string;

        try {
            const searchSQLResult = await pool.query<{
                idx: string;
                title: string;
                imgPath: string;
            }>(
                `SELECT
                    g.idx, g.title, t.img_path AS "imgPath"
                FROM
                    game g 
                JOIN
                    game_img_thumbnail t 
                ON 
                    g.idx = t.game_idx
                WHERE
                    title_kor
                ILIKE 
                    $1
                OR
                    title_eng
                ILIKE
                    $1 
                AND
                    t.deleted_at IS NULL`,
                [`%${title}%`]
            );
            const selectedGameList = searchSQLResult.rows;

            if (!selectedGameList.length) throw new NoContentException('No content');

            res.status(200).send({
                data: selectedGameList,
            });
        } catch (e) {
            next(e);
        }
    }
);

//인기게임목록불러오기(게시글순)
router.get('/popular', async (req, res, next) => {
    const page = Number(req.query.page);

    let skip: number;
    let count: number;
    if (page == 1) {
        //1페이지는 19개 불러오기
        count = 19;
        skip = 0;
    } else {
        //2페이지부터는 16개씩불러오기
        count = 16;
        skip = (page - 1) * 16 + 3;
    }

    try {
        const totalGamesQueryResult = await pool.query<TotalGamesNumber>(`
            SELECT
                count(*)
            FROM
                game g
            WHERE
                deleted_at IS NULL    
        `);
        const totalGamesNumber = totalGamesQueryResult.rows[0].count;
        const maxPage = Math.ceil((totalGamesNumber - 19) / 16) + 1;

        const popularSelectSQLResult = await pool.query<{
            idx: number;
            title: string;
            postCount: number;
            imgPath: string;
        }>(
            //게시글 수가 많은 게임 순서대로 게임 idx, 제목, 이미지경로 추출
            `
                SELECT
                    g.idx, g.title, count(*) AS "postCount" ,t.img_path  AS "imgPath"
                FROM 
                    game g 
                JOIN 
                    post p 
                ON 
                    g.idx = p.game_idx 
                JOIN 
                    game_img_thumbnail t 
                ON 
                    g.idx = t.game_idx 
                WHERE 
                    t.deleted_at IS NULL 
                GROUP BY 
                    g.title, t.img_path , g.idx
                ORDER BY 
                    "postCount" DESC
                LIMIT
                    $1
                OFFSET
                    $2`,
            [count, skip]
        );
        const popularGameList = popularSelectSQLResult.rows;

        if (!popularGameList.length) throw new NoContentException('No content');

        res.status(200).send({
            data: {
                maxPage: maxPage,
                page: page,
                skip: skip,
                count: popularGameList.length,
                gameList: popularGameList,
            },
        });
    } catch (e) {
        next(e);
    }
});

//배너이미지가져오기
router.get('/:gameidx/banner', async (req, res, next) => {
    const gameIdx = req.params.gameidx as string;
    try {
        //삭제되지않은 배너이미지경로 가져오기
        const bannerSQLResult = await pool.query<{ imgPath: string }>(
            `
            SELECT
                img_path AS "imgPath"
            FROM 
                game_img_banner
            WHERE
                game_idx = $1
            AND
                deleted_at IS NULL`,
            [gameIdx]
        );
        const banner = bannerSQLResult.rows;
        res.status(200).send({
            data: banner,
        });
    } catch (e) {
        next(e);
    }
});

//히스토리 목록보기
router.get('/:gameidx/history/all', async (req, res, next) => {
    const gameIdx = req.params.gameidx as string;
    try {
        //특정게임 히스토리목록 최신순으로 출력
        const selectHistorySQLResult = await pool.query<{
            idx: string;
            createdAt: string;
            nickname: string;
        }>(
            // history idx, 히스토리 제목(YYYY-MM-DD HH24:MI:SS 사용자닉네임) 출력
            `
            SELECT 
                h.idx, 
                TO_CHAR(h.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
                nickname
            FROM 
                history h 
            JOIN 
                "user" u
            ON 
                h.user_idx = u.idx
            WHERE 
                game_idx = $1
            AND
                h.created_at IS NOT NULL
            ORDER BY
                h.created_at DESC`,
            [gameIdx]
        );

        const selectGameSQLResult = await pool.query<{ idx: string; title: string }>(
            `
            SELECT
                idx, title
            FROM
                game
            WHERE
                idx = $1
            `,
            [gameIdx]
        );
        const game = selectGameSQLResult.rows[0];

        const historyList = selectHistorySQLResult.rows;

        res.status(200).send({
            data: {
                idx: game.idx,
                title: game.title,
                historyList: historyList,
            },
        });
    } catch (e) {
        next(e);
    }
});

//히스토리 자세히보기
router.get('/:gameidx/history/:historyidx?', async (req, res, next) => {
    let historyIdx = req.params.historyidx as string | undefined;
    const gameIdx = req.params.gameidx;
    try {
        if (!historyIdx) {
            //가장 최신 히스토리idx 출력
            const getLatestHistoryIdxSQLResult = await pool.query<{ max: string }>(
                `
                SELECT
                    MAX(idx)
                FROM
                    history
                WHERE
                    game_idx = $1
                AND
                    created_at IS NOT NULL
            `,
                [gameIdx]
            );
            historyIdx = getLatestHistoryIdxSQLResult.rows[0].max;
        }

        const getHistorySQLResult = await pool.query<{
            idx: string;
            gameIdx: string;
            userIdx: string;
            title: string;
            content: string;
            createdAt: string;
            nickname: string;
        }>(
            //히스토리 idx, gameidx, useridx, 내용, 시간, 닉네임 출력
            `
            SELECT    
                h.idx AS "historyIdx", h.game_idx AS "gameIdx", h.user_idx AS "userIdx", title ,content, h.created_at AS "createdAt", u.nickname 
            FROM 
                history h
            JOIN
                "user" u
            ON
                h.user_idx = u.idx
            JOIN
                game g
            ON 
                g.idx = h.game_idx
            WHERE 
                h.idx = $1
            AND 
                game_idx = $2`,
            [historyIdx, gameIdx]
        );
        const history = getHistorySQLResult.rows;

        res.status(200).send({ data: history });
    } catch (e) {
        next(e);
    }
});

//게임 수정하기
router.put(
    '/:gameidx/wiki',
    checkLogin,
    body('content').trim().isString().isLength({ min: 2 }).withMessage('2글자이상 입력해주세요'),
    handleValidationErrors,
    async (req, res, next) => {
        const gameIdx = req.params.gameidx;
        const { userIdx } = req.decoded!;
        const content = req.body.content as string;

        let poolClient: PoolClient | null = null;
        try {
            poolClient = await pool.connect();
            await poolClient.query(`BEGIN`);

            //기존 게임수정자들 추출
            const historyUserSQLResult = await poolClient.query<{ user_idx: string }>(
                `SELECT DISTINCT 
                    user_idx
                FROM
                    history
                WHERE 
                    game_idx = $1`,
                [gameIdx]
            );
            let historyUserList = historyUserSQLResult.rows;
            if (!historyUserList || historyUserList.length == 0)
                throw new NoContentException('No content');

            await generateNotifications({
                conn: poolClient,
                type: 'MODIFY_GAME',
                gameIdx: gameIdx,
                toUserIdx: historyUserList.map((elem) => elem.user_idx),
            });

            // 새로운 히스토리 등록
            await poolClient.query(
                `INSERT INTO  
                    history(game_idx, user_idx, content)
                VALUES
                    ($1, $2, $3)`,
                [gameIdx, userIdx, content]
            );

            await poolClient.query(`COMMIT`);

            res.status(201).send();
        } catch (e) {
            if (poolClient) await poolClient.query(`ROLLBACK`);
            next(e);
        } finally {
            if (poolClient) poolClient.release();
        }
    }
);

// 위키 이미지 업로드
router.post(
    '/:gameidx/wiki/image',
    checkLogin,
    uploadS3.array('images', 1),
    async (req, res, next) => {
        const historyIdx = req.params.historyidx;
        const images = req.files;
        console.log('images: ', images);

        try {
            if (!images) return res.status(400).send({ message: '이미지가 없습니다' });

            await pool.query(
                `INSERT INTO
                    game_img( history_idx, img_path )
                VALUES ( $1, $2 ) `
                // [historyIdx, images[0].location]
            );

            // res.status(201).send({ data: { location: images[0].location } });
        } catch (e) {
            next(e);
        }
    }
);

module.exports = router;
