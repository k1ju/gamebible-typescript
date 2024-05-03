import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { body, query } from 'express-validator';
import { pool } from '../config/postgres.js';
import { checkLogin } from '../middlewares/checkLogin.js';
import { generateVerificationCode } from '../modules/generateVerificationCode';
import { sendVerificationEmail } from '../modules/sendVerificationEmail';
import { changePwEmail } from '../modules/sendChangePwEmail.js';
import { deleteCode } from '../modules/deleteEmailCode.js';
import { uploadS3 } from '../middlewares/upload';
import { handleValidationErrors } from '../middlewares/validator';
import { hashPassword } from '../modules/hashPassword';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { UnauthorizedException } from '../exception/UnauthorizedException.js';
import { ConflictException } from '../exception/ConflictException.js';
import { Pool, PoolClient } from 'pg';
import { UserModel } from '../model/UserModel.js';
import { NoContentException } from '../exception/NoContentException.js';

const router = Router();

//로그인
router.post(
    '/auth',
    body('id')
        .trim()
        .isString()
        .isLength({ min: 4, max: 20 })
        .withMessage('아이디는 4자 이상 20자 이하로 해주세요.'),
    body('pw')
        .trim()
        .isString()
        .isLength({ min: 8, max: 20 })
        .withMessage('비밀번호는 8자 이상 20자 이하이어야 합니다.'),
    handleValidationErrors,
    async (req, res, next) => {
        const { id, pw }: { id: string; pw: string } = req.body;

        try {
            const userQuery = `
            SELECT
            *
            FROM
                account_local al
            JOIN
                "user" u ON al.user_idx = u.idx
            WHERE
                al.id = $1 AND u.deleted_at IS NULL`;

            const values = [id];

            const { rows: userRows } = await pool.query<{
                idx: string;
                is_admin: string;
                pw: string;
            }>(userQuery, values);

            if (userRows.length === 0) throw new UnauthorizedException('Invalid login');

            const user = userRows[0];

            const match = await bcrypt.compare(pw, user.pw);

            if (!match) throw new UnauthorizedException('Invalid password');

            const token = jwt.sign(
                {
                    userIdx: user.idx,
                    isAdmin: user.is_admin,
                },
                process.env.SECRET_KEY,
                {
                    expiresIn: '5h',
                }
            );

            res.status(200).send({ kakaoLogin: false, token: token, data: user });
        } catch (e) {
            next(e);
        }
    }
);

// 회원가입
router.post(
    '/',
    [
        body('id')
            .trim()
            .isString()
            .isLength({ min: 4, max: 20 })
            .withMessage('아이디는 4자 이상 20자 이하로 해주세요.'),
        body('pw')
            .trim()
            .isString()
            .isLength({ min: 8, max: 20 })
            .withMessage('비밀번호는 8자 이상 20자 이하이어야 합니다.'),
        body('email').trim().isString().isEmail().withMessage('유효하지 않은 이메일 형식입니다.'),
        body('nickname')
            .trim()
            .isString()
            .isLength({ min: 2, max: 20 })
            .withMessage('닉네임은 2자 이상 20자 이하로 해주세요.'),
        handleValidationErrors,
    ],
    async (req, res, next) => {
        const {
            id,
            pw,
            nickname,
            email,
        }: { id: string; pw: string; nickname: string; email: string } = req.body;

        const isadmin = false;
        let poolClient: PoolClient | null = null;

        try {
            poolClient = await pool.connect();
            await poolClient.query('BEGIN');

            //아이디 중복 확인
            const { rows: existingIdList } = await poolClient.query(
                `
            SELECT
                account_local.*
            FROM
                account_local
            JOIN
                "user"
            ON
                account_local.user_idx = "user".idx
            WHERE
                account_local.id = $1
            AND
                "user".deleted_at IS NULL`,
                [id]
            );
            if (existingIdList.length !== 0) throw new ConflictException('Existing id');

            //닉네임 중복 확인
            const { rows: existingNicknameList } = await poolClient.query(
                `
            SELECT
                *
            FROM
                "user"
            WHERE
                nickname = $1
            AND
                deleted_at IS NULL`,
                [nickname]
            );

            if (existingNicknameList.length != 0) throw new ConflictException('Existing nickname');

            //이메일 중복 확인
            const { rows: existingEmailList } = await poolClient.query(
                `
                SELECT
                    *
                FROM
                    "user"
                WHERE
                    email = $1
                AND
                    deleted_at IS NULL`,
                [email]
            );
            if (existingEmailList.length != 0) throw new ConflictException('Existing nickname');

            // 비밀번호 해싱
            const hashedPw = await hashPassword(pw);

            //user테이블 user 추가
            const { rows: userList } = await poolClient.query(
                `INSERT INTO
                    "user"(nickname,email,is_admin)
                VALUES 
                    ($1, $2, $3)
                RETURNING 
                    idx`,
                [nickname, email, isadmin]
            );
            if (userList.length === 0) throw new NoContentException('Fail signup');

            //account_local테이블 user 추가
            const { rows: accountList } = await poolClient.query(
                `
                INSERT INTO
                    account_local (user_idx,id,pw)
                VALUES 
                    ($1, $2, $3)
                RETURNING 
                    *`,
                [userList[0].idx, id, hashedPw]
            );
            if (accountList.length === 0) throw new NoContentException('Fail signup');

            await poolClient.query('COMMIT');
            return res.status(200).send('회원가입 성공');
        } catch (e) {
            if (poolClient) await poolClient.query('ROLLBACK');
            next(e);
        } finally {
            if (poolClient) poolClient.release();
        }
    }
);

//아이디 중복 확인
router.post(
    '/id/check',
    body('id')
        .trim()
        .isLength({ min: 4, max: 20 })
        .withMessage('아이디는 4자 이상 20자 이하로 해주세요.'),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { id } = req.body;

            const checkIdSql = `
        SELECT
            account_local.*
        FROM
            account_local
        JOIN
            "user"
        ON
            account_local.user_idx = "user".idx
        WHERE
            account_local.id = $1
        AND
            "user".deleted_at IS NULL;
        `;

            const values = [id];

            const idResults = await pool.query(checkIdSql, values);
            if (idResults.rows.length > 0) return res.status(409).send('아이디가 이미 존재합니다.');

            return res.status(200).send('사용 가능한 아이디입니다.');
        } catch (e) {
            next(e);
        }
    }
);

//닉네임 중복 확인
router.post(
    '/nickname/check',
    body('nickname')
        .trim()
        .isLength({ min: 2, max: 20 })
        .withMessage('닉네임은 2자 이상 20자 이하로 해주세요.'),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { nickname } = req.body;

            const checkNicknameSql = `
            SELECT
                *
            FROM
                "user"
            WHERE
                nickname = $1
            AND
                deleted_at IS NULL`;

            const value = [nickname];

            const nicknameResults = await pool.query(checkNicknameSql, value);
            if (nicknameResults.rows.length > 0)
                return res.status(409).send('닉네임이 이미 존재합니다.');

            return res.status(200).send('사용 가능한 닉네임입니다.');
        } catch (e) {
            next(e);
        }
    }
);

//이메일 중복 확인/인증
router.post(
    '/email/check',
    body('email').trim().isEmail().withMessage('유효하지 않은 이메일 형식입니다.'),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { email } = req.body;

            const checkEmailSql = `
        SELECT
            *
        FROM
            "user"
        WHERE
           email = $1
        AND
            deleted_at IS NULL`;

            const checkEmailvalue = [email];
            const emailResults = await pool.query(checkEmailSql, checkEmailvalue);
            if (emailResults.rows.length > 0) {
                return res.status(409).send('이메일이 이미 존재합니다.');
            } else {
                const verificationCode = generateVerificationCode();
                const insertQuery = `
            INSERT INTO
                email_verification (
                    email,
                    code
                    )
            VALUES
                ($1, $2)
            RETURNING *
            `;
                const codeValues = [email, verificationCode];
                const codeResults = await pool.query(insertQuery, codeValues);
                if (codeResults.rows.length == 0) {
                    return res.status(401).send('코드 저장 오류');
                }
                await sendVerificationEmail(email, verificationCode);
                await deleteCode(pool);
                return res.status(200).send('인증 코드가 발송되었습니다.');
            }
        } catch (e) {
            next(e);
        }
    }
);

//이메일 인증 확인
router.post(
    '/email/auth',
    body('code')
        .trim()
        .isLength({ min: 5, max: 5 })
        .withMessage('인증코드는 5자리 숫자로 해주세요.')
        .isNumeric()
        .withMessage('인증코드는 숫자로만 구성되어야 합니다.'),
    body('email').trim().isEmail().withMessage('유효하지 않은 이메일 형식입니다.'),
    handleValidationErrors,
    async (req, res, next) => {
        try {
            const { email, code } = req.body;
            const checkEmailSql = `
        SELECT
            *
        FROM
            email_verification
        WHERE
            email = $1
        AND
            code = $2`;
            const queryResult = await pool.query(checkEmailSql, [email, code]);
            if (queryResult.rows.length == 0) {
                return res.status(204).send('잘못된 인증 코드입니다.');
            }
            return res.status(200).send('이메일 인증이 완료되었습니다.');
        } catch (e) {
            next(e);
        }
    }
);

// 아이디 찾기
router.get(
    '/id',
    query('email').trim().isEmail().withMessage('유효하지 않은 이메일 형식입니다.'),
    handleValidationErrors,
    async (req, res, next) => {
        const email = req.query.email as string;
        try {
            const findIdxSql = `
            SELECT
                a.id
            FROM
                account_local a
            JOIN
                "user" u ON a.user_idx = u.idx
            WHERE
                u.email = $1
            AND
                u.deleted_at IS NULL;
        `;
            const findIdxvalue = [email];
            const results = await pool.query(findIdxSql, findIdxvalue);

            if (results.rows.length === 0) {
                return res.status(204).send('일치하는 사용자가 없습니다.');
            }
            const foundId = results.rows[0].id;

            return res.status(200).send({ id: foundId });
        } catch (err) {
            next(err);
        }
    }
);

//비밀번호 찾기(이메일 전송)
router.post(
    '/pw/email',
    body('email').trim().isEmail().withMessage('유효하지 않은 이메일 형식입니다.'),
    handleValidationErrors,
    async (req, res, next) => {
        const { email } = req.body;

        try {
            const emailToken = await changePwEmail(email);
            return res.status(200).send({ token: emailToken });
        } catch (err) {
            next(err);
        }
    }
);

//비밀번호 변경
router.put(
    '/pw',
    body('pw')
        .trim()
        .isLength({ min: 8, max: 20 })
        .withMessage('비밀번호는 8자 이상 20자 이하이어야 합니다.'),
    handleValidationErrors,
    checkLogin,
    async (req, res, next) => {
        const { pw }: { pw: string } = req.body;
        const { userIdx } = req.decoded;

        try {
            const hashedPw = await hashPassword(pw); // 비밀번호 해싱

            const { rows: updatePwList } = await pool.query(
                `
            UPDATE
                account_local
            SET
                pw = $2
            WHERE
                user_idx = $1
            RETURNING *`,
                [userIdx, hashedPw]
            );
            if (updatePwList.length === 0) {
                return res.status(204).send('비밀번호 변경 실패');
            }
            return res.status(200).send('비밀번호 변경 성공');
        } catch (err) {
            next(err);
        }
    }
);

// 내 정보 보기
router.get('/info', checkLogin, async (req, res, next) => {
    try {
        const { userIdx } = req.decoded;
        const { rows: userList } = await pool.query<UserModel>(
            `
            SELECT
                *
            FROM
                "user" 
            WHERE 
                idx = $1`,
            [userIdx]
        );

        if (userList.length === 0) {
            return res.status(204).send({ message: '내 정보 보기 실패' });
        }

        // 응답 전송
        res.status(200).send({
            data: {
                user: userList[0],
            },
        });
    } catch (err) {
        next(err);
    }
});

// 내 정보 수정
router.put(
    '/info',
    checkLogin,
    body('email').trim().isString().isEmail().withMessage('유효하지 않은 이메일 형식입니다.'),
    body('nickname')
        .trim()
        .isString()
        .isLength({ min: 2, max: 20 })
        .withMessage('닉네임은 2자 이상 20자 이하로 해주세요.'),
    handleValidationErrors,
    async (req, res, next) => {
        const { userIdx } = req.decoded;
        const { nickname, email }: { nickname: string; email: string } = req.body;

        try {
            const { rows: userList } = await pool.query<UserModel>(
                `
            SELECT
                *
            FROM
                "user"
            WHERE
                idx=$1
            AND
                deleted_at IS NULL`,
                [userIdx]
            );
            if (userList.length === 0) return res.status(204).send('사용자 정보 조회 실패');

            //닉네임 중복 확인

            const { rows: existingNicknameList } = await pool.query(
                `
            SELECT
                *
            FROM
                "user"
            WHERE
                nickname = $1
            AND
                nickname != $2
            AND
                deleted_at IS NULL`,
                [nickname, userList[0].nickname]
            );
            if (existingNicknameList.length !== 0)
                return res.status(409).send('닉네임이 이미 존재합니다.');

            const { rows: existingEmailList } = await pool.query(
                `
                SELECT
                    *
                FROM
                    "user"
                WHERE
                    email = $1
                AND
                    email != $2
                AND
                    deleted_at IS NULL`,
                [email, userList[0].email]
            );
            if (existingEmailList.length !== 0) throw new ConflictException('Existing email');

            const { rows: userInfo } = await pool.query(
                `
            UPDATE 
                "user"
            SET
                nickname = $2,
                email = $3
            WHERE
                idx = $1
            RETURNING 
                *`,
                [userIdx, nickname, email]
            );
            if (userInfo.length !== 0) throw new NoContentException('No content');

            return res.status(200).send({ message: '내 정보 수정 성공' });
        } catch (err) {
            next(err);
        }
    }
);

//프로필 이미지
router.put('/image', checkLogin, uploadS3.single('image'), async (req, res, next) => {
    const { userIdx } = req.decoded;
    const image = req.file;
    let poolClient: PoolClient | null = null;

    try {
        if (!image) return res.status(400).send({ message: '업로드 된 파일이 없습니다' });

        poolClient = await pool.connect();

        await poolClient.query('BEGIN');

        const { rows } = await pool.query(
            `SELECT
                *
            FROM
                profile_img
            WHERE
                user_idx = $1`,
            [userIdx]
        );

        if (rows.length > 0) {
            await poolClient.query(
                `
            UPDATE
                profile_img
            SET
                deleted_at = now()
            WHERE
                user_idx = $1`,
                [userIdx]
            );
            console.log('이전 이미지 삭제');
        }
        await poolClient.query(
            `INSERT INTO
                profile_img (
                    img_path,
                    user_idx
                    )
            VALUES 
                ($1, $2)
            RETURNING 
                *`,
            [image[0].location, userIdx]
        );

        await poolClient.query(`COMMIT`);

        return res.status(200).send('이미지 수정 성공');
    } catch (err) {
        if (poolClient) await poolClient.query(`ROLLBACK`);
        next(err);
    } finally {
        if (poolClient) poolClient.release();
    }
});

// 회원 탈퇴
router.delete('/', checkLogin, async (req, res, next) => {
    try {
        const { userIdx } = req.decoded;

        await pool.query(
            `
            UPDATE
                "user"
            SET
                deleted_at = now()
            WHERE
                idx = $1`,
            [userIdx]
        );

        return res.status(200).send('회원 탈퇴 성공');
    } catch (err) {
        next(err);
    }
});

//알람 출력
router.get('/notification', checkLogin, async (req, res, next) => {
    try {
        const { userIdx } = req.decoded;
        const lastIdx = (req.query.lastidx as string) || '1';

        //사용자 알람조회
        const { rows: notificationList } = await pool.query(
            `
            SELECT
                n.*,
                p.title AS post_title,
                g.title AS game_title
            FROM
                notification n
            LEFT JOIN
                post p ON n.post_idx = p.idx AND n.type = 1
            LEFT JOIN
                game g ON n.game_idx = g.idx AND (n.type = 2 OR n.type = 3)
            WHERE
                n.user_idx = $1
            AND
                n.idx > $2
            ORDER BY
                n.idx DESC
            LIMIT 20;`,
            [userIdx, lastIdx]
        );
        if (notificationList.length === 0) throw new NoContentException('No notification');

        res.status(200).send({ notifications: notificationList, lastIdx: notificationList[0].idx });
    } catch (err) {
        next(err);
    }
});

//알람 삭제
router.delete('/notification/:notificationId', checkLogin, async (req, res, next) => {
    try {
        const { userIdx } = req.decoded;
        const { notificationId } = req.params;

        // 알람 삭제 쿼리 실행
        await pool.query(
            `
            UPDATE
                notification
            SET
                deleted_at = now()
            WHERE
                idx = $1
            AND 
                user_idx = $2`,
            [notificationId, userIdx]
        );

        res.status(200).send({ message: '알림삭제 완료' });
    } catch (err) {
        next(err);
    }
});

//카카오 로그인(회원가입)경로
router.get('/auth/kakao', (req, res, next) => {
    const kakao = process.env.KAKAO_LOGIN_AUTH!;
    console.log('실행0');
    res.status(200).send({ data: kakao });
});

//카카오톡 로그인(회원가입)
router.get('/kakao/callback', async (req, res, next) => {
    const tokenRequestData = {
        grant_type: 'authorization_code',
        client_id: process.env.REST_API_KEY!,
        redirect_uri: process.env.REDIRECT_URI!,
        code: req.query.code as string,
    };

    let poolClient: PoolClient | null = null;
    try {
        poolClient = await pool.connect();

        const params = new URLSearchParams();
        Object.keys(tokenRequestData).forEach((key) => {
            params.append(key, tokenRequestData[key]);
        });

        // Axios POST 요청
        const { data: tokenResponse } = await axios.post(
            'https://kauth.kakao.com/oauth/token',
            params.toString(), // URLSearchParams 객체를 문자열로 변환
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );
        const ACCESS_TOKEN = tokenResponse.access_token;

        const config = {
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`,
            },
        };

        const { data: userInfo } = await axios.get('https://kapi.kakao.com/v2/user/me', config);

        await poolClient.query('BEGIN');

        //카카오 중복 확인
        const { rows: existingKakaoUserList } = await poolClient.query(
            `SELECT
                *
            FROM
                account_kakao ak
            JOIN
                "user" u ON ak.user_idx = u.idx
            WHERE
                ak.kakao_key = $1
            AND
                u.deleted_at IS NULL`,
            [userInfo.id]
        );
        if (existingKakaoUserList.length !== 0) throw new ConflictException('Existing kakao user');

        //이메일 중복 확인
        const { rows: existingEmailList } = await poolClient.query(
            `SELECT
                    *
                FROM
                    "user"
                WHERE
                    email = $1
                AND
                    deleted_at IS NULL`,
            [userInfo.kakao_account.email]
        );
        if (existingEmailList.length !== 0) throw new ConflictException('existing email');

        //랜덤 닉네임 생성
        function generateRandomString(length) {
            let result = '';
            let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let charactersLength = characters.length;
            for (let i = 0; i < length; i++) {
                result += characters.charAt(Math.floor(Math.random() * charactersLength));
            }
            return result;
        }
        let randomNickname = generateRandomString(20);

        //닉네임 중복 확인
        const { rows: existingNicknameList } = await poolClient.query(
            `
                SELECT
                    *
                FROM
                    "user"
                WHERE
                    nickname = $1
                AND
                    deleted_at IS NULL`,
            [randomNickname]
        );
        let nicknameResults;

        if (existingNicknameList.length !== 0) {
            while (existingNicknameList.length > 0) {
                randomNickname = generateRandomString(20);
                nicknameResults = await poolClient.query(
                    `
                SELECT
                    *
                FROM
                    "user"
                WHERE
                    nickname = $1
                AND
                    deleted_at IS NULL`,
                    [randomNickname]
                );
            }
        }

        const kakaoResult = await poolClient.query(
            `
            INSERT INTO
                "user"(nickname,email,is_admin)
            VALUES
                ($1, $2, $3)
            RETURNING
                idx`,
            [
                randomNickname,
                userInfo.kakao_account.email,
                false, //굳이 관리자 권한 안 줘도 되겠지?
            ]
        );
        if (kakaoResult.rows.length === 0) throw new NoContentException('Fail kakao signup');

        const userIdx = kakaoResult.rows[0].idx;

        const { rows: accountList } = await poolClient.query(
            `
        INSERT INTO
            account_kakao (user_idx,kakao_key)
        VALUES
            ($1, $2)
        RETURNING
            *`,
            [userIdx, userInfo.id]
        );

        if (accountList.length === 0) throw new NoContentException('');

        const { rows: KakaoLoginUser } = await poolClient.query(
            `
        SELECT
            *
        FROM
            account_kakao ak
        JOIN
            "user" u ON ak.user_idx = u.idx
        WHERE
            ak.kakao_key = $1 
        AND 
            u.deleted_at IS NULL`,
            [userInfo.id]
        );

        if (KakaoLoginUser.length === 0) {
            throw new NoContentException('Fail kakao auth');
        }

        const user = KakaoLoginUser[0];

        await poolClient.query('COMMIT');

        const token = jwt.sign(
            {
                id: userInfo.id,
                userIdx: user.user_idx,
                isAdmin: user.is_admin,
            },
            process.env.SECRET_KEY,
            {
                expiresIn: '5h',
            }
        );
        return res.status(200).json({
            idx: user.user_idx,
            id: userInfo.id,
            email: userInfo.kakao_account.email,
            token: token,
        });
    } catch (err) {
        if (poolClient) await poolClient.query('ROLLBACK');
        next(err);
    } finally {
    }
});

//카카오톡 탈퇴
router.delete('/auth/kakao', checkLogin, async (req, res, next) => {
    const SERVICE_APP_ADMIN_KEY = process.env.ADMIN_KEY;
    const { userIdx } = req.decoded;

    try {
        const { rows: user } = await pool.query(
            `
            SELECT
                *
            FROM
                "user" u
            JOIN
                account_kakao a
            ON
                u.idx = a.user_idx
            WHERE
                idx = $1
        `,
            [userIdx]
        );
        console.log('user', user[0]);

        // const response = await axios.post(
        //     'https://kapi.kakao.com/v1/user/unlink',
        //     `target_id_type=user_id&target_id=${user.id}`,
        //     {
        //         headers: {
        //             'Content-Type': 'application/x-www-form-urlencoded',
        //             Authorization: `KakaoAK ${SERVICE_APP_ADMIN_KEY}`,
        //         },
        //     }
        // );

        const { rowCount: deleteNumber } = await pool.query(
            `
            UPDATE
                "user"
            SET
                deleted_at = now()
            WHERE
                idx = $1`,
            [userIdx]
        );

        if (deleteNumber === 0) throw new NoContentException('Fail withdrawal');

        res.json('회원 탈퇴 성공');
    } catch (err) {
        next(err);
    }
});

export = router;
