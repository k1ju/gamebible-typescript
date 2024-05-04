//Import
import { Router } from 'express';
import { pool } from '../config/postgres';
import { checkLogin } from '../middlewares/checkLogin';
import { generateNotification } from '../modules/generateNotification';
import { body } from 'express-validator';
import { PoolClient } from 'pg';
import { PostModel } from '../model/PostModel';
import { CommentModel } from '../model/CommentModel';

const router = Router();

//댓글 쓰기
router.post(
    '/',
    checkLogin,
    body('content')
        .trim()
        .isLength({ min: 1, max: 1000 })
        .withMessage('내용은 1~1000자로 입력해주세요'),
    async (req, res, next) => {
        const content: string = req.body.content;
        const gameIdx = req.query.gameidx as string;
        const postIdx = req.query.postidx as string;
        const { userIdx } = req.decoded;

        let poolClient: PoolClient | null = null;
        try {
            poolClient = await pool.connect();
            await poolClient.query('BEGIN');

            await poolClient.query(
                `
            INSERT INTO
                comment(
                    user_idx,
                    post_idx,
                    content
                )
            VALUES
                ($1, $2, $3)`,
                [userIdx, postIdx, content]
            );

            const { rows: postList } = await poolClient.query<PostModel>(
                `
                SELECT
                    p.title, p.content, p.created_at AS "createdAt", p.game_idx AS "gameIdx", u.idx AS "userIdx", u.nickname
                FROM
                    post p
                JOIN
                    "user" u
                ON 
                    u.idx = p.user_idx;
                WHERE
                    idx = $1`,
                [postIdx]
            );

            await poolClient.query('COMMIT');

            await generateNotification({
                conn: poolClient,
                type: 'MAKE_COMMENT',
                gameIdx: gameIdx,
                postIdx: postIdx,
                toUserIdx: postList[0].userIdx,
            });
            res.status(201).end();
        } catch (err) {
            if (poolClient) await poolClient.query(`ROLLBACK`);
            next(err);
        } finally {
            if (poolClient) poolClient.release();
        }
    }
);

//댓글 보기
//무한스크롤
router.get('/all', checkLogin, async (req, res, next) => {
    const lastIdx = (req.query.lastidx as string) || '0';
    const postIdx = req.query.postidx as string;
    const { userIdx } = req.decoded;

    try {
        // totalcomments를 가져오는 별도의 쿼리
        const { rows: totalComment } = await pool.query<{ commentCount: number }>(
            `SELECT
                COUNT(*)::int AS "commentCount"
            FROM
                comment
            WHERE
                post_idx = $1
            AND 
                deleted_at IS NULL`,
            [postIdx]
        );

        //20개씩 불러오기
        const { rows: commentList } = await pool.query<CommentModel>(
            `
            SELECT
                c.idx,
                c.content,
                c.created_at AS "createdAt",
                c.post_idx AS "postIdx",
                c.user_idx AS "userIdx",
                u.nickname
            FROM 
                comment c
            JOIN
                "user" u
            ON 
                c.user_idx = u.idx
            WHERE
                post_idx = $1
            AND 
                c.deleted_at IS NULL
            AND
                c.idx > $2
            ORDER BY
                c.idx ASC
            LIMIT
                20`,
            [postIdx, lastIdx]
        );

        if (commentList.length === 0) {
            res.status(200).end();
        } else {
            res.status(200).send({
                data: commentList,
                lastIdx: commentList[commentList.length - 1].idx,
                totalComments: totalComment[0].commentCount,
            });
        }
    } catch (err) {
        next(err);
    }
});

//댓글 삭제
router.delete('/:commentidx', checkLogin, async (req, res, next) => {
    const { commentIdx } = req.params;
    const { userIdx } = req.decoded;

    try {
        await pool.query(
            `
            UPDATE 
                comment
            SET
                deleted_at = now()
            WHERE
                idx = $1
            AND 
                user_idx = $2`,
            [commentIdx, userIdx]
        );
        res.status(200).send();
    } catch (err) {
        next(err);
    }
});

export = router;
