//Import
import { Router } from 'express';
import { pool } from '../config/postgres';
import { checkLogin } from '../middlewares/checkLogin';
import { body, query } from 'express-validator';
import { handleValidationErrors } from '../middlewares/validator';
import { uploadS3 } from '../middlewares/upload';
import { BadRequestException } from '../exception/BadRequestException';
import { PostModel } from '../model/PostModel';
import { PoolClient } from 'pg';

const router = Router();

//게시글 업로드
router.post(
    '/',
    checkLogin,
    body('title').trim().isLength({ min: 2, max: 40 }).withMessage('제목은 2~40자로 입력해주세요'),
    body('content')
        .trim()
        .isLength({ min: 2, max: 10000 })
        .withMessage('본문은 2~10000자로 입력해주세요'),
    handleValidationErrors,
    async (req, res, next) => {
        const { title, content }: { title: string; content: string } = req.body;
        const gameIdx = req.query.gameidx as string;
        const { userIdx } = req.decoded;
        try {
            const { rows: postList } = await pool.query(
                `INSERT INTO
                post(
                    user_idx,
                    game_idx,
                    title,
                    content,
                    created_at
                )
                VALUES
                    ($1, $2, $3, $4, null)
                RETURNING
                    game_idx AS "gameIdx"`,
                [userIdx, gameIdx, title, content]
            );
            res.status(201).send({ data: postList[0] });
        } catch (err) {
            next(err);
        }
    }
);

// 게시글 이미지 업로드
router.post('/image', checkLogin, uploadS3.array('images', 1), async (req, res, next) => {
    const images = req.files![0] as Express.MulterS3.File;

    try {
        if (!images) throw new BadRequestException('No image');

        res.status(201).send({ data: images.location });
    } catch (e) {
        next(e);
    }
});

//게시판 보기 (게시글 목록보기)
//페이지네이션
//deleted_at 값이 null이 아닌 경우에는 탈퇴한 사용자
router.get('/all', async (req, res, next) => {
    const page = Number(req.query.page) || 1;
    const gameIdx = req.query.gameidx as string;

    try {
        // totalposts를 가져오는 별도의 쿼리
        const { rows: totalPosts } = await pool.query<{ postCount: number }>(
            `SELECT
                COUNT(*)::int AS "postCount"
            FROM
                post
            WHERE
                game_idx = $1
            AND 
                deleted_at IS NULL`,
            [gameIdx]
        );
        //20개씩 불러오기
        const postsPerPage = 20;
        const offset = (page - 1) * postsPerPage;
        const maxPage = Math.ceil(totalPosts[0].postCount / postsPerPage);
        const result = await pool.query<PostModel>(
            `SELECT 
                post.idx AS "postIdx",
                post.title,
                post.created_at AS "createdAt",
                "user".idx AS "userIdx",
                "user".nickname,
            -- 조회수
            (
                SELECT
                    COUNT(*)::int
                FROM
                    view
                WHERE
                    post_idx = post.idx
            ) AS view
        FROM
                post
            JOIN
                "user" ON post.user_idx = "user".idx
            WHERE
                post.game_idx = $1
            AND 
                post.deleted_at IS NULL
            ORDER BY
                post.idx DESC
            LIMIT
                $2
            OFFSET
                $3`,
            [gameIdx, postsPerPage, offset]
        );
        res.status(200).send({
            data: result.rows,
            page,
            maxPage,
            totalPosts: totalPosts[0].postCount,
            offset,
            length: result.rows.length,
        });
    } catch (err) {
        next(err);
    }
});

//게시글 검색하기
//페이지네이션
router.get(
    '/search',
    query('title').trim().isLength({ min: 2 }).withMessage('2글자 이상입력해주세요'),
    async (req, res, next) => {
        const page = Number(req.query!.page) || 1;
        const title = req.query!.title as string;

        try {
            // totalposts를 가져오는 별도의 쿼리
            const { rows: totalPost } = await pool.query<{ postCount: number }>(
                `SELECT
                    COUNT(*)::int AS "postCount"
                FROM
                    post
                WHERE
                    post.title LIKE '%' ||$1|| '%'
                AND 
                    deleted_at IS NULL`,
                [title]
            );
            //7개씩 불러오기
            const postsPerPage = 7;
            const offset = (page - 1) * postsPerPage;
            const maxPage = Math.ceil(totalPost[0].postCount / postsPerPage);
            const result = await pool.query<PostModel>(
                `SELECT 
                    post.game_idx AS "gameIdx",
                    post.idx AS "postIdx",
                    post.title,
                    post.created_at AS "createdAt",
                    "user".idx AS "userIdx",
                    "user".nickname,
                    -- 조회수
                    (
                        SELECT
                            COUNT(*)::int
                        FROM
                            view
                        WHERE
                            post_idx = post.idx 
                    ) AS view
                FROM 
                    post 
                LEFT JOIN
                    view ON post.idx = view.post_idx
                JOIN 
                    "user" ON post.user_idx = "user".idx
                WHERE
                    post.title LIKE '%' ||$1|| '%'
                AND 
                    post.deleted_at IS NULL
                ORDER BY
                    post.idx DESC
                LIMIT
                    $2
                OFFSET
                    $3`,
                [title, postsPerPage, offset]
            );
            res.status(200).send({
                data: result.rows,
                page,
                maxPage,
                totalPosts: totalPost[0].postCount,
                offset,
                length: result.rows.length,
            });
        } catch (err) {
            return next(err);
        }
    }
);

//게시글 상세보기
router.get('/:postidx', checkLogin, async (req, res, next) => {
    const postIdx = req.params.postidx;
    let poolClient: PoolClient | null = null;
    const { userIdx } = req.decoded;

    try {
        let isAuthor = false;
        poolClient = await pool.connect();
        await poolClient.query('BEGIN');

        await poolClient.query(
            `
            -- 조회수 반영하기
            INSERT INTO
                view(
                    post_idx,
                    user_idx
                )
            VALUES
                ($1, $2)`,
            [postIdx, userIdx]
        );

        const { rows: postList } = await poolClient.query<PostModel>(
            `
            SELECT 
                post.title, 
                post.content,
                post.created_at AS "createdAt",
                post.game_idx AS "gameIdx",
                "user".idx AS "userIdx",
                "user".nickname,
                -- 조회수 불러오기
                (
                    SELECT
                        COUNT(*)::int
                    FROM
                        view
                    WHERE
                        post_idx = post.idx 
                ) AS view
            FROM 
                post
            JOIN
                "user" ON post.user_idx = "user".idx
            WHERE
                post.idx = $1
            AND 
                post.deleted_at IS NULL`,
            [postIdx]
        );
        if (userIdx == postList[0].userIdx) isAuthor = true;

        res.status(200).send({
            data: postList[0],
            isAuthor: isAuthor,
        });
        await poolClient.query('COMMIT');
    } catch (err) {
        if (poolClient) await poolClient.query('ROLLBACK');
        next(err);
    } finally {
        if (poolClient) poolClient.release();
    }
});

//게시글 삭제하기
router.delete('/:postidx', checkLogin, async (req, res, next) => {
    const { postIdx } = req.params;
    const { userIdx } = req.decoded;
    try {
        await pool.query(
            `
            UPDATE 
                post
            SET
                deleted_at = now()
            WHERE
                idx = $1
            AND 
                user_idx = $2`,
            [postIdx, userIdx]
        );
        res.status(200).send();
    } catch (err) {
        next(err);
    }
});

export = router;
